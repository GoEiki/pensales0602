// server.js - ESM（import形式）対応済み完全版

import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import http from "http";
import { WebSocketServer } from "ws";
import OpenAI from "openai";

// .env から API キー読み込み
dotenv.config();

const app = express();
const port = 3001;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(express.json());
app.use(cors());
app.use(express.static("public"));

// WebSocketサーバー設定
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// 選択肢ロジック
const options = [
  ["インクの色", "ペンの芯"],
  ["フォロー", "次の話題"],
  ["頑丈さ", "コスト"],
  ["フォロー", "次の話題"],
  ["デザイン", "持ちやすさ"],
  ["フォロー", "次の話題"]
];

let currentStep = 0;
const characterSettings = {
  role: "system",
  content: `
    あなたは店員と一緒にお客さんにボールペンを進めるロボットです。
    ###指示の内容によって以下の内容を話してください。例文の番号に沿ってそのまま読み上げてください。

    #1「こちらのマルチペンはインクが5色もあります。ノートを取るときに色をたくさん使った方が記憶に残りやすいですよ。」
    #2「こちらの高い方のペンは滑らかな芯を使っているので、長時間書いても疲れないですよ。」
    #3「こちらのマルチペンはアルミでできているし、中身も頑丈な素材でできているので長く使えますよ」
    #4「マルチペンはお値段高いですけど、中の芯は安いので、交換しながら長く使っていただくとコスパがいいんですよ。」
    #5「こちらのマルチペンはデザインも良いですし、学校やオフィスで使えば異性からモテモテになっちゃいますよ」
    #6「このマルチペンは持ちやすさにも拘っていて、特に普段からたくさん文字を書く人にはおすすめです。」

    ###「店員の話した内容をフォローして」という指示が来たら、直前の店員の話した内容を裏付けて追加で説明するようにしてください。
      - この際、できるだけ店員の話したワードを拾ってそれに付け加えて気の利いたことを言ってください。
      - 時々関西弁で喋ってください。
      - この際、たまに「そうそう」とか「そうなんですよね」とつけて、発話は30文字以内にしてください。
  `,
};

let conversationHistory = [characterSettings];

// WebSocketクライアントとのやりとり
wss.on("connection", (ws) => {
  console.log("🟢 クライアント接続");
  ws.send(JSON.stringify({ step: currentStep }));

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      if (data.action === "next") {
        currentStep++;
        broadcastStep(currentStep);
      }
    } catch (err) {
      console.error("❌ WebSocket受信エラー:", err);
    }
  });
});

// 全クライアントに step を送信
function broadcastStep(step) {
  const msg = JSON.stringify({ step });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(msg);
    }
  });
}

// GPT API 呼び出しエンドポイント
app.post("/gpt", async (req, res) => {
  const userInput = req.body.text;
  try {
    conversationHistory.push({ role: "user", content: userInput });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: conversationHistory,
    });
    const reply = completion.choices[0].message.content;
    conversationHistory.push({ role: "assistant", content: reply });
    res.json({ reply });
  } catch (err) {
    console.error("[GPTエラー]", err);
    res.status(500).send("GPTリクエスト失敗");
  }
});

// サーバー起動
server.listen(port, () => {
  console.log(`✅ Server listening at http://localhost:${port}`);
});