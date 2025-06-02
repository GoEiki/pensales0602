const transcriptEl = document.getElementById("transcript");
const statusEl = document.getElementById("status");

let recognition;
let transcript = "";
let currentStep = 0;

const prompts = [
  ["#1を出力して", "#2を出力して"],
  ["フォロー", "次の話題"],
  ["#3を出力して", "#4を出力して"],
  ["フォロー", "次の話題"],
  ["#5を出力して", "#6を出力して"],
  ["フォロー", "次の話題"]
];

// 音声認識の初期化
if ('webkitSpeechRecognition' in window) {
  recognition = new webkitSpeechRecognition();
  recognition.lang = 'ja-JP';
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    let finalTranscript = "";
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      finalTranscript += event.results[i][0].transcript;
    }
    transcript = finalTranscript;
    transcriptEl.textContent = transcript;
  };

  // 無音などのエラーにも耐えるように再起動
  recognition.onerror = (e) => {
    console.error("音声認識エラー:", e);
    if (e.error === "no-speech" || e.error === "audio-capture" || e.error === "not-allowed") {
      recognition.stop();
      setTimeout(() => recognition.start(), 500);
    }
  };

  // 終わったらすぐ再開（自然停止対策）
  recognition.onend = () => {
    console.log("認識終了 → 自動再開");
    recognition.start();
  };

  recognition.start();
} else {
  alert("このブラウザではwebkitSpeechRecognitionがサポートされていません。");
}

// WebSocket接続
const ws = new WebSocket(`ws://${location.hostname}:3001`);
ws.onopen = () => console.log("WebSocket connected");

// キー入力処理
document.addEventListener("keydown", async (event) => {
  if (event.key !== 'a' && event.key !== 'b') return;
  if (!transcript) return;

  const key = event.key;
  const pair = prompts[currentStep];
  let promptToSend = null;

  if (pair[0] === "フォロー" && pair[1] === "次の話題") {
    if (key === 'a') {
      promptToSend = "店員の話した内容をフォローして";
      // ステップ進めない（何度でもフォローできる）
    } else {
      // bキー（次の話題）だけステップを進める
      ws.send(JSON.stringify({ action: "next", key }));
      currentStep++;
      statusEl.textContent = "次の話題へ";
      transcript = "";
      transcriptEl.textContent = "";
      return;
    }
  } else {
    promptToSend = key === 'a' ? pair[0] : pair[1];
  }

  const combined = `${promptToSend}。${transcript}`;
  statusEl.textContent = "送信中...";

  try {
    const res = await fetch('/gpt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: combined })
    });

    const data = await res.json();
    const reply = data.reply;

    // 音声認識を一時停止
    recognition.stop();

    // 読み上げ
    const utter = new SpeechSynthesisUtterance(reply);
    utter.lang = 'ja-JP';
    utter.rate = 1.3;
    utter.pitch = 1.1;
    utter.volume = 1.0;

    utter.onend = () => {
      statusEl.textContent = "待機中";
      recognition.start(); // 読み上げ後に再開
    };

    utter.onerror = () => {
      statusEl.textContent = "エラー（読み上げ失敗）";
      recognition.start(); // 念のため再開
    };

    speechSynthesis.speak(utter);

    // ステップ更新と通知（※修正ポイント）
    if (!(pair[0] === "フォロー" && pair[1] === "次の話題" && key === 'a')) {
      currentStep++;
      ws.send(JSON.stringify({ action: "next", key }));
    }

    transcript = "";
    transcriptEl.textContent = "";

  } catch (err) {
    console.error("送信エラー:", err);
    statusEl.textContent = "エラー";
  }
});