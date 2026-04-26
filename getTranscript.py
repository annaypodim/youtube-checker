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
        "The reader must finish your write-up knowing the SPECIFIC content of the "
        "video: the actual question being asked, the actual solutions proposed, "
        "the actual code, commands, names, numbers, and reasoning. "
        "If your output could describe any other video on a similar topic, you "
        "have failed.\n\n"
        "ANTI-PATTERNS — these are forbidden and will be considered a failed output:\n"
        "- 'The video addresses a technical question and explores potential solutions.'\n"
        "- 'This video will quickly show you a technical question as well as possible solutions.'\n"
        "- Any sentence that names a category (e.g. 'a technical question', "
        "'some solutions', 'various approaches') without naming the actual "
        "question, the actual solutions, or the actual approaches.\n"
        "- Any sentence whose specifics you could not reconstruct from the "
        "transcript alone.\n\n"
        "REQUIRED CONTENT:\n"
        "- If the title or transcript poses a question, state the EXACT question "
        "verbatim or near-verbatim.\n"
        "- If the video presents N solutions/methods/approaches, you MUST describe "
        "each one of the N — what it does, how it works, and any code, syntax, "
        "function names, or commands used. Number them if the video does.\n"
        "- Preserve exact identifiers: function names, library names, syntax, "
        "file names, numeric values, error messages, quoted phrases.\n"
        "- Code snippets, commands, or syntax from the transcript must appear in "
        "<code> tags inline, or in <pre><code> blocks for multi-line code.\n"
        "- Do not generalize technical content. 'Use a loop' is wrong if the "
        "video shows `for i in range(len(arr)):`.\n\n"
        "STYLE RULES:\n"
        "- Reuse the speaker's wording for technical and distinctive terms; do "
        "not paraphrase them.\n"
        "- No filler ('In this video', 'The creator explains', 'The speaker "
        "discusses', 'This video will'). Write directly.\n"
        "- Do not invent detail. If the transcript is genuinely empty or "
        "unintelligible, say so explicitly in the Overview and stop.\n"
        "- No emoji. No marketing tone. No restating the title.\n\n"
        "OUTPUT FORMAT — return ONLY the inner HTML email body (no <html>, "
        "<head>, or <body> tags, no <h1>/<h2>, no font-size overrides, no "
        "inline color). Use <p> for paragraphs, <ul><li> for bullets, "
        "<b> for emphasis only where the transcript itself emphasizes a term, "
        "<code>/<pre> for code.\n\n"
        "STRUCTURE — produce exactly these three sections, in this order, "
        "with the literal headings shown wrapped in <p><b>...</b></p>:\n\n"
        "<p><b>Overview</b></p>\n"
        "One sentence stating the SPECIFIC topic — name the actual question, "
        "problem, or claim. Not 'a technical question' but the question itself.\n\n"
        "<p><b>The Video, Condensed</b></p>\n"
        "2 to 5 short paragraphs walking through the substance in the order "
        "presented. If the video lists N solutions/methods, dedicate one "
        "paragraph per solution and explain each one with its actual mechanism "
        "and any code shown. Use 3+ paragraphs only when there is that much "
        "distinct content; do not pad.\n\n"
        "<p><b>Actionable Takeaways</b></p>\n"
        "A <ul> of concrete, specific actions the viewer can implement, drawn "
        "from the recommendations, steps, code, or tools shown. Each bullet "
        "must be something the reader could actually do or copy. Reference the "
        "specific methods or syntax from the video. If the video offers no "
        "actionable content, write a single <li> saying so.\n\n"
        "TRANSCRIPT:\n" + transcript
    )

    summary = client.models.generate_content(
        model="gemini-2.5-flash",
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
        "Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.55; "
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