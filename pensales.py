import websocket
import threading
import json
import time
import openai
import os
import queue
import pyttsx3
import tempfile
from datetime import datetime
import speech_recognition as sr

# OpenAIキー
openai.api_key = os.getenv("OPENAI_API_KEY")

# 音声合成設定
engine = pyttsx3.init('nsss')
engine.setProperty('voice', 'com.apple.speech.synthesis.voice.kyoko')
engine.setProperty('rate', 188)

# Whisper
recognizer = sr.Recognizer()
microphone = sr.Microphone()
audio_queue = queue.Queue()
recognizer_event = threading.Event()

# プロンプト構成
character_settings = {
    "role": "system",
    "content": "あなたは店員をフォローするアシスタントです..."
}
prompts = [
    ("#1を出力して", "#2を出力して"),
    ("#3を出力して", "#4を出力して"),
]
gpt_messages = [character_settings]

# ステータス変数
current_topic_index = 0
in_follow_phase = False

def speak_text(text):
    for sentence in text.split('。'):
        if sentence:
            engine.say(sentence + '。')
            engine.runAndWait()
            time.sleep(0.3)

def recognize_from_mic():
    recognizer_event.wait()
    with microphone as source:
        recognizer.adjust_for_ambient_noise(source)
        audio = recognizer.listen(source)
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as f:
        f.write(audio.get_wav_data())
        filename = f.name
    with open(filename, "rb") as audio_file:
        transcript = openai.Audio.transcribe("whisper-1", audio_file, language="ja")
        return transcript["text"]

def handle_key_input(key):
    global current_topic_index, in_follow_phase

    print(f"[受信] キー: {key}")

    user_text = recognize_from_mic()
    print(f"[音声認識] {user_text}")

    if not in_follow_phase:
        idx = 0 if key == 'a' else 1
        prompt = prompts[current_topic_index][idx]
        in_follow_phase = True
    else:
        if key == 'a':
            prompt = "店員の話した内容をフォローして"
        else:
            current_topic_index += 1
            in_follow_phase = False
            return  # b を押しただけならスキップ

    combined = f"{prompt}。{user_text}"
    gpt_messages.append({"role": "user", "content": combined})
    response = openai.ChatCompletion.create(model="gpt-4o", messages=gpt_messages)
    output = response.choices[0].message.content
    gpt_messages.append({"role": "assistant", "content": output})
    speak_text(output)

def on_message(ws, message):
    try:
        data = json.loads(message)
        key = data.get("key")
        if key in ["a", "b"]:
            handle_key_input(key)
    except Exception as e:
        print("[エラー]", e)

def start_ws_client():
    ws = websocket.WebSocketApp(
        "ws://localhost:3001/input-to-python",
        on_message=on_message
    )
    ws.run_forever()

if __name__ == "__main__":
    recognizer_event.set()
    threading.Thread(target=start_ws_client, daemon=True).start()
    print("🟢 pensales.py is running. Waiting for key input from WebSocket...")

    while True:
        time.sleep(1)
        