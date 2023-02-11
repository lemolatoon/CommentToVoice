import * as dotenv from "dotenv";
import fs from "node:fs";
import { Configuration, OpenAIApi } from "openai";
import { LiveChat } from "youtube-chat";
// 'node-wav-player' has no type declaration
// eslint-disable-next-line @typescript-eslint/no-var-requires
const player = require("node-wav-player");
import * as voicevox from "voicebox-api-client-generated";
import portAudio from "naudiodon";

const main = async () => {
  const { apiKey, channelId, liveId, voicevoxEndpoint } =
    await getEnvVariables();
  const configuration = new Configuration({
    apiKey: apiKey,
  });
  const openai = new OpenAIApi(configuration);
  const voicevoxConfiguration = new voicevox.Configuration({
    basePath: voicevoxEndpoint,
  });
  const voicevoxApi = new voicevox.DefaultApi(voicevoxConfiguration);
  const liveChat = new LiveChat({ liveId });
  console.log(portAudio.getDevices());
  const deviceId = getVirtualAudioDeviceId();
  console.log(deviceId);

  await genWavFile(`test`, voicevoxApi);
  playWav(deviceId);

  const commentTextPrefix = `
あなたは日本語で配信しているずんだもんです。あなたはこれから視聴者からの質問に答えます。この後に質問が続きます。語尾に必ず「～なのだ」をつけて答えてください。

以下はずんだもんの設定です。

東北ずん子の武器である「ずんだアロー」に変身する妖精またはマスコット
一人称はボク

以下はずんだもんのセリフです。

視聴者「あなたは誰？」
ずんだもん「ボクはずんだもんなのだ！」


ずんだもんっぽく、なるべく長文で以下に返信してください。
`;

  await liveChat.on("chat", async (chatItem) => {
    const diff = Date.now() - chatItem.timestamp.getTime();
    const commentText = chatItem.message.reduce((prev, current) => {
      if ("text" in current) {
        return `${prev}${current.text}`;
      } else {
        return `${prev}${current.emojiText}`;
      }
    }, "");
    if (diff > 30 * 1000) {
      console.log(`This is old: ${commentText}`);
      return;
    }
    await writeCommentText(commentText);
    await genWavFile(`質問、${commentText}`, voicevoxApi);
    playWav(deviceId);
    const answerText = await (async () => {
      try {
        const response = await openai.createCompletion({
          model: "text-davinci-002",
          prompt: `${commentTextPrefix}視聴者「${commentText}」`,
          temperature: 0,
          max_tokens: 1000,
          top_p: 1,
          frequency_penalty: 0.0,
          presence_penalty: 0.0,
        });
        let text = response.data.choices[0].text ?? "エラーが起きたのだ。";
        text = text.trimStart();
        if (text.startsWith("ずんだもん「") && text.endsWith("」")) {
          console.log("answer is sliced.");
          text = text.slice(6, text.length - 1);
        }
        return text;
      } catch (e: unknown) {
        if (e instanceof Error) {
          console.log(e.message);
          return e.message;
        }
        return "エラーが起きたのだ。";
      }
    })();
    console.log({ commentText, answerText });
    await writeAnswerText(answerText);
    await genWavFile(answerText, voicevoxApi);
    playWav(deviceId);
  });

  await liveChat.on("error", (e: unknown) => {
    if (e instanceof Error) {
      console.log(e.message);
      writeAnswerText(e.message);
    } else {
      writeAnswerText("エラーハンドリングをしているのだ。");
    }
  });

  await liveChat.start();
};

const wavPath = "./voice.wav";
const getVirtualAudioDeviceId = () => {
  const VB_CABLE_NAME = "CABLE Input (VB-Audio Virtual Cable)";
  const deviceId = portAudio
    .getDevices()
    .filter((deviceInfo) => deviceInfo.name === VB_CABLE_NAME)[0].id;
  return deviceId;
};

const playWav = (deviceId: number) => {
  // player.play({ path: wavPath });
  console.log(portAudio.getDevices()[deviceId]);
  const audioIOWritableStream = portAudio.AudioIO({
    outOptions: {
      channelCount: 1,
      sampleFormat: portAudio.SampleFormat16Bit,
      sampleRate: 48000,
      deviceId: deviceId, // Use -1 or omit the deviceId to select the default device
      closeOnError: true, // Close the stream if an audio error is detected, if set false then just log the error
    },
  });
  const wavReadableStream = fs.createReadStream(wavPath);
  wavReadableStream.pipe(audioIOWritableStream);
  audioIOWritableStream.start();
};

const genWavFile = async (text: string, api: voicevox.DefaultApi) => {
  const query = await api.audioQueryAudioQueryPost({ text, speaker: 1 });
  const wav = await api.synthesisSynthesisPost({
    audioQuery: query,
    speaker: 1,
  });
  await fs.writeFileSync(
    wavPath,
    await Buffer.from(await wav.arrayBuffer()),
    "binary"
  );
};

// open files
const answerTextFilePath = "./answer.txt";
const commentTextFilePath = "./comment.txt";

const writeAnswerText = async (text: string) => {
  await fs.writeFile(answerTextFilePath, text, (err) => {
    if (err) throw err;
  });
};

const writeCommentText = async (text: string) => {
  await fs.writeFile(commentTextFilePath, text, (err) => {
    if (err) throw err;
  });
};

const getEnvVariables = async () => {
  dotenv.config();
  const env = process.env;
  const apiKey = env["apiKey"];
  const channelId = env["channelId"];
  const liveId = env["liveId"];
  const voicevoxEndpoint = env["voicevoxEndpoint"];
  if (
    apiKey != null &&
    channelId != null &&
    liveId != null &&
    voicevoxEndpoint != null
  ) {
    return { apiKey, channelId, liveId, voicevoxEndpoint };
  } else {
    throw new Error(
      "apiKey or channelId or liveId or voicevoxEndpoint not found in .env"
    );
  }
};

main();
