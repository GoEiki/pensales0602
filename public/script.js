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
    if (e.error === "aborted") return;  // ★修正ポイント: abortは無視
    if (["no-speech", "audio-capture", "not-allowed"].includes(e.error)) {
      recognition.stop();
      setTimeout(() => recognition.start(), 500);
    }
  };

  recognition.onend = () => {
    console.log("認識終了"); // ★修正ポイント: 自動再開は削除（競合防止）
    // recognition.start(); ← ここ削除
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

  const key = event.key;
  const pair = prompts[currentStep];
  if (!pair) return;

  const isFollowPhase = pair[0] === "フォロー" && pair[1] === "次の話題";

  let promptToSend = null;

  if (isFollowPhase) {
    if (key === 'a') {
      promptToSend = "店員の話した内容をフォローして";
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

  const combined = `${promptToSend}。${transcript || ""}`; // transcriptが空でもOK
  statusEl.textContent = "送信中...";
  
// document.addEventListener("keydown", async (event) => {
//   if (event.key !== 'a' && event.key !== 'b') return;

//   // 🛠️ 修正：aキーのときだけ transcript をチェック
//   if (event.key === 'a' && !transcript) return;

//   const key = event.key;
//   const pair = prompts[currentStep];
//   let promptToSend = null;

//   if (pair[0] === "フォロー" && pair[1] === "次の話題") {
//     if (key === 'a') {
//       promptToSend = "店員の話した内容をフォローして";
//     } else {
//       ws.send(JSON.stringify({ action: "next", key }));
//       currentStep++;
//       statusEl.textContent = "次の話題へ";
//       transcript = "";
//       transcriptEl.textContent = "";
//       return;
//     }
//   }
//    else {
//     promptToSend = key === 'a' ? pair[0] : pair[1];
//   }

//   const combined = `${promptToSend}。${transcript}`;
//   statusEl.textContent = "送信中...";

  try {
    // 音声認識を一時停止（明示的に止めてから読み上げ）
    console.log("🎤 音声認識：停止中（読み上げのため）");
    recognition.abort(); // ★修正ポイント: stop() → abort()（onendイベント抑止）

    const res = await fetch('/gpt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: combined })
    });

    const data = await res.json();
    const reply = data.reply;

    // 読み上げ
    const utter = new SpeechSynthesisUtterance(reply);
    utter.lang = 'ja-JP';
    utter.rate = 1.3;
    utter.pitch = 1.1;
    utter.volume = 1.0;

    utter.onend = () => {
      console.log("🗣️ 読み上げ終了 → 100ms後に音声認識再開");
      setTimeout(() => {
        try {
          recognition.start();  //再開はここだけ
          statusEl.textContent = "待機中";
        } catch (err) {
          console.warn("⚠️ 認識スタート失敗:", err);
        }
      }, 100);  //0.1秒待ってから再開
    };

    utter.onerror = () => {
      console.error("読み上げエラー");
      setTimeout(() => recognition.start(), 100);
      statusEl.textContent = "エラー（読み上げ失敗）";
    };

    speechSynthesis.speak(utter);

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