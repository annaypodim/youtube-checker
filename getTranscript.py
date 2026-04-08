from dotenv import load_dotenv
import os
import sys
import smtplib
from email.mime.text import MIMEText
from serpapi import GoogleSearch #transcript api
from google import genai as gemini #llm for summary

load_dotenv()
serpKey = os.getenv("serp")
geminiKey = os.getenv("gemini")
gmailAddress = os.getenv("GMAIL_ADDRESS")
gmailAppPassword = os.getenv("GMAIL_APP_PASSWORD")
notifyEmail = os.getenv("NOTIFY_EMAIL")


def getTranscript(id):
    params = {
    "engine": "youtube_video_transcript",
    "v": id,
    "api_key": serpKey
    }

    search = GoogleSearch(params)
    results = search.get_dict()

    transcript = results.get("transcript", [])
    transcriptStr = ""
    for entry in transcript:
        #print(f"{entry['start_time_text']}: {entry['snippet']}")
        transcriptStr += entry['snippet']
    return transcriptStr

def geminiSummarize(transcript):
    client = gemini.Client(
        api_key=geminiKey,
        http_options={'api_version': 'v1beta'}
    )

    summary = client.models.generate_content(
        model="gemini-2.5-flash-lite",
        contents=("Summarize this video transcript in less than 1000 characters: "+ transcript)
    )

    return summary.text

def sendEmail(body):
    msg = MIMEText(body)
    msg["Subject"] = "New YouTube Video Summary"
    msg["From"] = gmailAddress
    msg["To"] = notifyEmail

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(gmailAddress, gmailAppPassword)
        server.send_message(msg)
    print(f"Email sent to {notifyEmail}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python getTranscript.py <video_id>")
        sys.exit(1)

    videoId = sys.argv[1]
    transcript = getTranscript(videoId)
    summary = geminiSummarize(transcript)
    print(summary)
    sendEmail(summary)