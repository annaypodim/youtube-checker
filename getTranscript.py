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

ID = ""


def getTranscript(id):
    global ID
    ID = id
    params = {
    "engine": "youtube_video_transcript",
    "v": id,
    "api_key": serpKey
    }

    search = GoogleSearch(params)
    results = search.get_dict()

    transcript = results.get("transcript", [])
    transcriptStr = ""
    transcriptWithTimestamps = ""
    for entry in transcript:
        #print(f"{entry['start_time_text']}: {entry['snippet']}")
        transcriptStr += entry['snippet'] + " "
        transcriptWithTimestamps += entry['start_time_text'] + ": " + entry['snippet'] + "\n"
    return transcriptStr.strip(), transcriptWithTimestamps.strip()

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

def geminiGetClip(summary, transcriptWithTimestamps):
    client = gemini.Client(
        api_key=geminiKey,
        http_options={'api_version': 'v1beta'}
    )

    prompt = (
        "You are an expert audio/video transcript analyst and content curator. Your task is to extract the most interesting, engaging, or \"cool\" moments mentioned in a provided summary and map them to their exact timestamps in the transcript.\n\n"
        "Below, you are given a <summary> of an event and the full <transcript> of that event. Each line in the transcript begins with a start time. \n\n"
        "Summary: " + summary + "\n\n"
        "Transcript: " + transcriptWithTimestamps + "\n\n"
        "### Instructions:\n"
        "1. Analyze the <summary> to identify the most compelling, interesting, or cool moments. You do NOT need to cover every point in the summary—focus only on the absolute best highlights.\n"
        "2. Locate ALL continuous blocks of dialogue in the <transcript> that correspond to these selected highlight points. A single highlight might be discussed in multiple separate portions of the transcript.\n"
        "3. For each selected highlight, create a concise title strictly between 5 and 10 words long that captures why the moment is interesting.\n"
        "4. Determine the starting timestamp (the time of the first line discussing the point) and the ending timestamp (the start time of the line immediately following the end of the point) for EVERY portion where that highlight is discussed.\n"
        "5. Append multiple timestamp pairs for the same highlight using a semicolon (;) as the separator. \n"
        "6. You must output NOTHING BUT the formatted text. Do not include any conversational filler, markdown formatting, headers, or explanations before or after the data. \n\n"
        "### Output Format:\n"
        "Your entire response must strictly adhere to the following exact format, with one highlight per line. \n\n"
        "If the highlight is discussed in one continuous portion:\n"
        "[5-10 Word Title],[Start Time],[End Time]\n\n"
        "If the highlight is discussed in multiple separate portions:\n"
        "[5-10 Word Title],[Start Time 1],[End Time 1];[Start Time 2],[End Time 2];[Start Time 3],[End Time 3]"
    )
        

    urls = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
    )

    text = urls.text.strip()
    text = re.sub(r"^```.*?\n", "", text)
    text = re.sub(r"\n```$", "", text)
    
    # Split the urls variable (text) by semi colon, then split each by comma.
    # We carry the title from the first segment of each line if multiple exist.
    results = []
    segments = text.replace('\n', ';').split(';')
    current_title = ""
    for segment in segments:
        segment = segment.strip()
        if not segment: continue
        
        parts = [p.strip() for p in segment.split(',')]
        if len(parts) >= 3:
            # New highlight: Title, S1, E1
            current_title = ",".join(parts[:-2])
            results.append([current_title, parts[-2], parts[-1]])
        elif len(parts) == 2 and current_title:
            # Continuation segment: S2, E2
            results.append([current_title, parts[0], parts[1]])
            
    return results

def formatPublished(iso_string):
    if not iso_string:
        return ""
    try:
        dt = datetime.fromisoformat(iso_string.replace("Z", "+00:00"))
        return dt.strftime("%B %-d, %Y at %-I:%M %p UTC")
    except ValueError:
        return iso_string


def timestamp_to_seconds(ts):
    if not ts: return 0
    # Remove any unwanted characters like brackets
    ts = ts.strip('[] ')
    parts = ts.split(':')
    try:
        if len(parts) == 3: # H:M:S
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
        elif len(parts) == 2: # M:S
            return int(parts[0]) * 60 + int(parts[1])
        elif len(parts) == 1: # S
            return int(parts[0])
    except ValueError:
        return 0
    return 0


def buildEmailBody(summary_html, title, channel, published, clips, video_id):
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

    clips_html = ""
    if clips:
        clips_html += '<p><b>Interesting Clips</b></p>'
        for clip in clips:
            clip_title, start_ts, end_ts = clip
            start_sec = timestamp_to_seconds(start_ts)
            end_sec = timestamp_to_seconds(end_ts)
            # Using localhost:3000 as a default base for Next.js
            url = f"http://localhost:3000/clip/{video_id}?start={start_sec}&end={end_sec}"
            clips_html += (
                f'<p style="margin-bottom: 4px;"><b>{html.escape(clip_title)}</b></p>'
                f'<p style="margin-top: 0; margin-bottom: 16px;"><a href="{url}">{url}</a></p>'
            )

    return (
        '<div style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', '
        "Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.55; "
        'color: #1f2a1f; max-width: 680px;">'
        + header
        + summary_html
        + clips_html
        + "</div>"
    )

def authEmail(recipients, channel, verify_url):
    if not recipients:
        print("No recipients provided; skipping send.")
        return

    safe_channel = html.escape(channel or "your channel")
    safe_url = html.escape(verify_url)

    body = (
        '<div style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', '
        'Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.55; '
        'color: #1f2a1f; max-width: 680px;">'
        f'<h2 style="margin: 0 0 6px 0;">Verify your Channel Digest subscription</h2>'
        f'<p style="margin: 0 0 16px 0;">You requested email summaries for '
        f'<b>{safe_channel}</b>. Click the button below to confirm your address '
        'and activate your subscription.</p>'
        f'<p><a href="{safe_url}" style="display:inline-block; padding: 10px 20px; '
        'background:#2563eb; color:#fff; border-radius:6px; text-decoration:none; '
        f'font-weight:600;">Verify my subscription</a></p>'
        f'<p style="margin-top:16px; color:#555;">Or copy this link into your browser:</p>'
        f'<p style="word-break:break-all;"><a href="{safe_url}" style="color:#2563eb;">{safe_url}</a></p>'
        '<p style="color:#888; font-size:12px; margin-top:24px;">'
        'If you did not request this, you can safely ignore this email.</p>'
        '</div>'
    )

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(gmailAddress, gmailAppPassword)
        for recipient in recipients:
            msg = MIMEText(body, "html")
            msg["Subject"] = f"Verify your Channel Digest subscription for {channel or 'your channel'}"
            msg["From"] = gmailAddress
            msg["To"] = recipient
            server.send_message(msg)
            print(f"Authentication email sent to {recipient}")

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
    # --auth-mode sends a verification email instead of a transcript summary.
    parser.add_argument("--auth-mode", action="store_true", help="Send a verification email instead of a summary.")
    parser.add_argument("video_id", nargs="?", default="", help="YouTube video ID (required in summary mode).")
    parser.add_argument("--title", default="")
    parser.add_argument("--channel", default="")
    parser.add_argument("--published", default="")
    parser.add_argument("--to", default="", help="Comma-separated recipient emails. Falls back to NOTIFY_EMAIL.")
    # Auth-mode-only args:
    parser.add_argument("--token", default="", help="Verification UUID token (auth mode only).")
    parser.add_argument("--base-url", default="http://localhost:3000", help="Base URL of the web app (auth mode only).")
    args = parser.parse_args()

    recipients = [e.strip() for e in args.to.split(",") if e.strip()]
    if not recipients and notifyEmail:
        recipients = [notifyEmail]

    if args.auth_mode:
        verify_url = f"{args.base_url.rstrip('/')}/verify?token={args.token}"
        authEmail(recipients, args.channel, verify_url)
    else:
        if not args.video_id:
            raise SystemExit("video_id is required in summary mode.")

        transcript, transcriptWithTimestamps = getTranscript(args.video_id)
        summary = geminiSummarize(transcript)
        clips = geminiGetClip(summary, transcriptWithTimestamps)

        body = buildEmailBody(summary, args.title, args.channel, args.published, clips, args.video_id)

        subject_bits = []
        if args.channel:
            subject_bits.append(args.channel)
        subject_bits.append(args.title or "New YouTube Video")
        subject = " — ".join(subject_bits)

        sendEmail(body, recipients, subject=subject)