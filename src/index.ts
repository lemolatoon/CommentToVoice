import * as dotenv from "https://deno.land/std@0.177.0/dotenv/mod.ts";
import * as fs from "https://deno.land/std@0.175.0/fs/mod.ts";
import * as path from "https://deno.land/std@0.175.0/path/mod.ts";
import { Configuration, OpenAIApi } from "npm:openai@3";
import { LiveChat } from "npm:youtube-chat@2";

const main = async () => {
  const { apiKey, channelId } = await getEnvVariables();
  const configuration = new Configuration({
    apiKey: apiKey,
  });
  const openai = new OpenAIApi(configuration);
  const liveChat = new LiveChat({ channelId });

  const commentTextPrefix = `
あなたは日本語で配信しているAI配信者です。あなたはこれから視聴者からの質問に答えます。あなたは語尾に必ず「のだ」をつけます。この後に質問が続きます。

`;

  liveChat.on("chat", async (chatItem) => {
    const commentText = chatItem.message.reduce((prev, current) => {
      if ("text" in current) {
        return `${prev}${current.text}`;
      } else {
        return `${prev}${current.emojiText}`;
      }
    }, "");
    clearCommentText();
    writeCommentText(commentText);
    const answerText = await (async () => {
      try {
        const response = await openai.createCompletion({
          model: "text-davinci-002",
          prompt: `${commentTextPrefix}${commentText}`,
        });
        return response.data.choices[0].text ?? "エラーが起きたのだ。";
      } catch (e: unknown) {
        if (e instanceof Error) {
          console.log(e.message);
          return e.message;
        }
        return "エラーが起きたのだ。";
      }
    })();
    writeAnswerText(answerText);
  });

  liveChat.on("error", (e: unknown) => {
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
const __filename = path.fromFileUrl(import.meta.url);
const answerTextFileUrl = new URL(import.meta.resolve("./../answer.txt"));
const commentTextFileUrl = new URL(import.meta.resolve("./../comment.txt"));
await fs.ensureFile(answerTextFileUrl);
await fs.ensureFile(commentTextFileUrl);
const answerTextFile = await Deno.open(answerTextFileUrl, {read: false, write: true});
const commentTextFile = await Deno.open(commentTextFileUrl, {read: false, write: true});

const writeAnswerText = async (text: string) => {
    const encoder = new TextEncoder();
    const writer = answerTextFile.writable.getWriter()
    for (const ch of [...text]) {
        await writer.write(encoder.encode(ch));
        await sleep(1);
    }
    writer.releaseLock();
};

const writeCommentText = async (text: string) => {
    const encoder = new TextEncoder();
    const writer = commentTextFile.writable.getWriter()
    for (const ch of [...text]) {
        await writer.write(encoder.encode(ch));
        await sleep(1);
    }
    writer.releaseLock();
};

const clearCommentText = () => {
    const encoder = new TextEncoder();
    const writer = commentTextFile.writable.getWriter()
    writer.write(encoder.encode(""));
    writer.releaseLock();
};

const getEnvVariables = async () => {
  const env = await dotenv.load();
  const apiKey = env["apiKey"];
  const channelId = env["channelId"];
  if (apiKey != null && channelId != null) {
    return { apiKey, channelId };
  } else {
    throw new Error("apiKey or channelId not found in .env");
  }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(() => resolve(undefined), ms));

main();
