from dotenv import load_dotenv
from datetime import datetime
import argparse
import html
import os
import re
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

    prompt = (
        "You are condensing a YouTube video for a subscriber who will not watch it. "
        "Produce a concise version of the video itself — not a generic overview. "
        "The reader should finish your write-up with the same understanding, "
        "details, examples, and reasoning the video provides.\n\n"
        "STRICT RULES:\n"
        "- Preserve the speaker's exact phrasing, terminology, names, numbers, "
        "quotes, examples, and ordering whenever they carry meaning. "
        "Do not paraphrase technical or distinctive language; reuse the "
        "transcript's wording.\n"
        "- Do not add commentary, opinions, hedging, or filler such as "
        "'In this video', 'The creator explains', 'The speaker discusses'. "
        "Write directly as if delivering the content yourself.\n"
        "- Do not invent or generalize. If a detail is in the transcript, keep it. "
        "If it is not, do not add it.\n"
        "- No emoji. No marketing tone. No restating the title.\n\n"
        "OUTPUT FORMAT — return ONLY the inner HTML email body (no <html>, "
        "<head>, or <body> tags, no <h1>/<h2>, no font-size overrides, no "
        "inline color). All elements inherit the surrounding font. "
        "Use <p> for paragraphs, <ul><li> for bullets, <b> for emphasis "
        "ONLY where the transcript itself emphasizes a term.\n\n"
        "STRUCTURE — produce exactly these three sections in this order, "
        "separated by a blank line. Use the literal headings shown, each "
        "wrapped in <p><b>...</b></p>:\n\n"
        "<p><b>Overview</b></p>\n"
        "One sentence stating what the video covers, in the speaker's own framing.\n\n"
        "<p><b>The Video, Condensed</b></p>\n"
        "2 to 5 short paragraphs that walk through the substance of the video "
        "in the order it was presented. Each paragraph covers one segment, "
        "argument, or example. Include the specific details, names, numbers, "
        "and reasoning from the transcript. Use 3+ paragraphs only when the "
        "video actually has that much distinct content; do not pad. Use the "
        "speaker's exact terminology.\n\n"
        "<p><b>Actionable Takeaways</b></p>\n"
        "A <ul> of concrete, specific actions the viewer can implement, drawn "
        "directly from recommendations, tips, steps, or tools mentioned in the "
        "video. Each bullet must be something the reader could actually do — "
        "skip generic advice. If the video offers no actionable content (e.g. "
        "pure entertainment, news recap), write a single <li> stating that.\n\n"
        "TRANSCRIPT:\n" + transcript
    )

    summary = client.models.generate_content(
        model="gemini-2.5-flash-lite",
        contents=prompt,
    )

    text = summary.text.strip()
    text = re.sub(r"^```(?:html)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text


def formatPublished(iso_string):
    if not iso_string:
        return ""
    try:
        dt = datetime.fromisoformat(iso_string.replace("Z", "+00:00"))
        return dt.strftime("%B %-d, %Y at %-I:%M %p UTC")
    except ValueError:
        return iso_string


def buildEmailBody(summary_html, title, channel, published):
    safe_title = html.escape(title or "New YouTube Video")
    safe_channel = html.escape(channel or "")
    pretty_published = html.escape(formatPublished(published))

    meta_bits = []
    if safe_channel:
        meta_bits.append(safe_channel)
    if pretty_published:
        meta_bits.append(f"Posted {pretty_published}")
    meta_line = " &middot; ".join(meta_bits)

    header = (
        f'<h2 style="margin:0 0 6px 0;">{safe_title}</h2>'
        + (f'<p style="margin:0 0 22px 0; color:#566252;">{meta_line}</p>' if meta_line else "")
    )

    return (
        '<div style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', '
        "Helvetica, Arial, sans-serif; font-size: 17px; line-height: 1.6; "
        'color: #1f2a1f; max-width: 680px;">'
        + header
        + summary_html
        + "</div>"
    )

def sendEmail(body, recipients, subject="New YouTube Video Summary"):
    if not recipients:
        print("No recipients provided; skipping send.")
        return

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(gmailAddress, gmailAppPassword)
        for recipient in recipients:
            msg = MIMEText(body, "html")
            msg["Subject"] = subject
            msg["From"] = gmailAddress
            msg["To"] = recipient
            server.send_message(msg)
            print(f"Email sent to {recipient}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("video_id")
    parser.add_argument("--title", default="")
    parser.add_argument("--channel", default="")
    parser.add_argument("--published", default="")
    parser.add_argument("--to", default="", help="Comma-separated recipient emails. Falls back to NOTIFY_EMAIL.")
    args = parser.parse_args()

    recipients = [e.strip() for e in args.to.split(",") if e.strip()]
    if not recipients and notifyEmail:
        recipients = [notifyEmail]

    transcript = getTranscript(args.video_id)
    summary = geminiSummarize(transcript)
    body = buildEmailBody(summary, args.title, args.channel, args.published)

    subject_bits = []
    if args.channel:
        subject_bits.append(args.channel)
    subject_bits.append(args.title or "New YouTube Video")
    subject = " — ".join(subject_bits)

    sendEmail(body, recipients, subject=subject)