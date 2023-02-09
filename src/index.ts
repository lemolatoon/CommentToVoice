import * as dotenv from "https://deno.land/std@0.177.0/dotenv/mod.ts";
import * as fs from "https://deno.land/std@0.175.0/fs/mod.ts";
import * as path from "https://deno.land/std@0.175.0/path/mod.ts";
import { Configuration, OpenAIApi } from "npm:openai@3";
import { LiveChat } from "npm:youtube-chat@2.2";

const main = async () => {
  const { apiKey, channelId, liveId } = await getEnvVariables();
  const configuration = new Configuration({
    apiKey: apiKey,
  });
  const openai = new OpenAIApi(configuration);
  const liveChat = new LiveChat({ liveId });

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
    await clearCommentText();
    await writeCommentText(commentText);
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
    console.log({commentText, answerText});
    await writeAnswerText(answerText);
  });

  await liveChat.on("error", (e: unknown) => {
    clearCommentText();
    if (e instanceof Error) {
        console.log(e.message);
        writeAnswerText(e.message);
    } else { 
        writeAnswerText("エラーハンドリングをしているのだ。");
    }
  })

  await liveChat.start();
};

// open files
const answerTextFileUrl = new URL(import.meta.resolve("./../answer.txt"));
const commentTextFileUrl = new URL(import.meta.resolve("./../comment.txt"));
await fs.ensureFile(answerTextFileUrl);
await fs.ensureFile(commentTextFileUrl);

const writeAnswerText = async (text: string) => {
    await Deno.writeTextFile(answerTextFileUrl, text);
};

const writeCommentText = async (text: string) => {
    await Deno.writeTextFile(commentTextFileUrl, text);
};

const clearCommentText = () => {
};

const getEnvVariables = async () => {
  const env = await dotenv.load();
  const apiKey = env["apiKey"];
  const channelId = env["channelId"];
  const liveId = env["liveId"];
  if (apiKey != null && channelId != null && liveId != null) {
    return { apiKey, channelId, liveId };
  } else {
    throw new Error("apiKey or channelId or liveId not found in .env");
  }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(() => resolve(undefined), ms));

main();
