from dotenv import load_dotenv
import os
import re
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
        contents = (
    "You are a concise, intelligent video summarizer. "
    "A user has received a new YouTube video from a channel they follow. "ß
    "Your job is to summarize the transcript so they can get full value "
    "from the video without watching it.\n\n"
    "Return your response as an HTML email body (no <html> or <body> tags, "
    "just the inner content). Use the font family 'Times New Roman', Times, serif "
    "for all text. Use <ul> and <li> for bullet points. Use <b> for any bold text. "
    "Do not use any inline font-size changes — keep all text the same size. "
    "Start with a <p> style tag setting the font for the whole block.\n\n"
    "Structure your summary as follows:\n\n"
    "- Start with 2–3 sentences giving a plain-English overview of "
    "what the video is about and why it matters.\n"
    "- Then list the key insights, findings, or arguments made in the "
    "video — one bullet per idea, written as a complete, informative "
    "sentence. Include enough detail that the reader actually learns "
    "something, not just that a topic was mentioned.\n"
    "- Follow with any concrete tips, techniques, recommendations, or "
    "step-by-step instructions covered in the video. Each bullet should "
    "be actionable and specific.\n"
    "- If the video references any tools, resources, people, books, "
    "links, or products worth knowing about, list them with a one-line "
    "description of why they're relevant.\n"
    "- Close with 1–2 sentences on the bottom line: what the viewer "
    "should take away or do after watching.\n\n"
    "Do not include filler phrases like 'In this video...' or "
    "'The creator explains...'. Write as if briefing a busy professional. "
    "If the transcript is low-signal (e.g. a short vlog or mostly "
    "entertainment), say so briefly and summarize what you can.\n\n"
    + transcript
))

    text = summary.text.strip()
    text = re.sub(r"^```(?:html)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text

def sendEmail(body):
    msg = MIMEText(body, "html")
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