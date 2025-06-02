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

  recognition.onerror = (e) => {
    console.error("音声認識エラー:", e);
    if (e.error === "no-speech" || e.error === "audio-capture" || e.error === "not-allowed") {
      recognition.stop();
      setTimeout(() => recognition.start(), 500);
    }
  };

  recognition.onend = () => {
    console.log("認識終了 → 自動再開");
    setTimeout(() => recognition.start(), 100); // 再開を少し遅延
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
  const key = event.key;
  if (key !== 'a' && key !== 'b') return;

  const pair = prompts[currentStep];
  if (!pair) {
    console.warn("これ以上進めません。");
    return;
  }

  const isFollowPhase = pair[0] === "フォロー" && pair[1] === "次の話題";

  if (!isFollowPhase && !transcript) {
    console.log("音声認識の入力がまだありません。");
    return;
  }

  let promptToSend = null;

  if (isFollowPhase) {
    if (key === 'a') {
      promptToSend = "店員の話した内容をフォローして";
      // フォローは何回でもOK、ステップ進めない
    } else {
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
    recognition.stop(); // 読み上げ前に確実に停止
    const res = await fetch('/gpt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: combined })
    });

    const data = await res.json();
    const reply = data.reply;

    const utter = new SpeechSynthesisUtterance(reply);
    utter.lang = 'ja-JP';
    utter.rate = 1.3;
    utter.pitch = 1.1;
    utter.volume = 1.0;

    utter.onend = () => {
      statusEl.textContent = "待機中";
      setTimeout(() => recognition.start(), 100);
    };

    utter.onerror = () => {
      statusEl.textContent = "エラー（読み上げ失敗）";
      setTimeout(() => recognition.start(), 100);
    };

    speechSynthesis.speak(utter);

    if (!isFollowPhase || key === 'b') {
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