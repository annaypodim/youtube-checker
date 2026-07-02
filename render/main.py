"""
Channel Digest — FastAPI backend for transcript summarisation & email dispatch.
Deployed on Render (free tier). Called by Supabase Edge Functions.
"""

import html as html_mod
import json
import os
import re
import smtplib
import urllib.request
from datetime import datetime
from email.mime.text import MIMEText
from typing import List, Optional

from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel

from serpapi import GoogleSearch
from google import genai as gemini

# ── Environment variables ────────────────────────────────────────────────────

SERP_KEY = os.getenv("serp", "")
GEMINI_KEY = os.getenv("gemini", "")
GMAIL_ADDRESS = os.getenv("GMAIL_ADDRESS", "")
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD", "")
NOTIFY_EMAIL = os.getenv("NOTIFY_EMAIL", "")
YT_API_KEY = os.getenv("YT_API_KEY", "")

# ── FastAPI app ──────────────────────────────────────────────────────────────

app = FastAPI(title="Channel Digest API", version="1.0.0")


# ── Request models ───────────────────────────────────────────────────────────

class ProcessVideoRequest(BaseModel):
    video_id: str
    title: Optional[str] = ""
    channel: Optional[str] = ""
    published: Optional[str] = ""
    recipients: List[str] = []


class ProcessNewsletterRequest(BaseModel):
    video_ids: List[str]
    newsletter_name: str = ""
    recipients: List[str] = []


# ── Health check ─────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


# ── Process a single video (individual subscriptions) ────────────────────────

@app.post("/process-video")
async def process_video(req: ProcessVideoRequest, background_tasks: BackgroundTasks):
    """
    Accepts a video notification, immediately returns 200,
    then processes the transcript + sends email in the background.
    """
    recipients = req.recipients if req.recipients else ([NOTIFY_EMAIL] if NOTIFY_EMAIL else [])
    if not recipients:
        return {"status": "skipped", "reason": "no recipients"}

    background_tasks.add_task(
        _process_single_video,
        req.video_id,
        req.title or "",
        req.channel or "",
        req.published or "",
        recipients,
    )
    return {"status": "accepted", "video_id": req.video_id}


# ── Process a newsletter digest ──────────────────────────────────────────────

@app.post("/process-newsletter")
async def process_newsletter(req: ProcessNewsletterRequest, background_tasks: BackgroundTasks):
    """
    Accepts a list of video IDs for a newsletter, immediately returns 200,
    then processes transcripts + sends digest email in the background.
    """
    recipients = req.recipients if req.recipients else ([NOTIFY_EMAIL] if NOTIFY_EMAIL else [])
    if not recipients or not req.video_ids:
        return {"status": "skipped", "reason": "no recipients or video_ids"}

    background_tasks.add_task(
        _process_newsletter_digest,
        req.video_ids,
        req.newsletter_name or "Your Newsletter",
        recipients,
    )
    return {"status": "accepted", "video_count": len(req.video_ids)}


# ══════════════════════════════════════════════════════════════════════════════
# CORE LOGIC — preserved from getTranscript.py
# ══════════════════════════════════════════════════════════════════════════════


def get_transcript(video_id: str):
    """Fetch transcript via SerpAPI."""
    params = {
        "engine": "youtube_video_transcript",
        "v": video_id,
        "api_key": SERP_KEY,
    }
    try:
        search = GoogleSearch(params)
        results = search.get_dict()
        transcript = results.get("transcript", [])
    except Exception as e:
        print(f"Error fetching transcript for {video_id}: {e}")
        transcript = []

    transcript_str = ""
    transcript_with_timestamps = ""
    for entry in transcript:
        transcript_str += entry["snippet"] + " "
        transcript_with_timestamps += entry["start_time_text"] + ": " + entry["snippet"] + "\n"
    return transcript_str.strip(), transcript_with_timestamps.strip()


def gemini_summarize(transcript: str) -> str:
    """Summarise a transcript using Gemini."""
    client = gemini.Client(api_key=GEMINI_KEY, http_options={"api_version": "v1beta"})

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

    summary = client.models.generate_content(model="gemini-3.5-flash", contents=prompt)
    text = summary.text.strip()
    text = re.sub(r"^```(?:html)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text


def gemini_get_clips(summary: str, transcript_with_timestamps: str, max_clips=None):
    """Extract interesting clips from a transcript."""
    client = gemini.Client(api_key=GEMINI_KEY, http_options={"api_version": "v1beta"})

    clip_instruction = ""
    if max_clips:
        clip_instruction = f"IMPORTANT: Extract no more than {max_clips} clips TOTAL across all content.\n"

    prompt = (
        "You are an expert audio/video transcript analyst and content curator. "
        "Your task is to extract the most interesting, engaging, or \"cool\" moments "
        "mentioned in a provided summary and map them to their exact timestamps in the transcript.\n\n"
        "Below, you are given a <summary> of an event and the full <transcript> of that event. "
        "Each line in the transcript begins with a start time. \n\n"
        "Summary: " + summary + "\n\n"
        "Transcript: " + transcript_with_timestamps + "\n\n"
        "### Instructions:\n"
        "1. Analyze the <summary> to identify the most compelling, interesting, or cool moments. "
        "You do NOT need to cover every point in the summary—focus only on the absolute best highlights.\n"
        f"{clip_instruction}"
        "2. Locate ALL continuous blocks of dialogue in the <transcript> that correspond to these "
        "selected highlight points.\n"
        "3. For each selected highlight, create a concise title strictly between 5 and 10 words long.\n"
        "4. Determine the starting timestamp and ending timestamp for EVERY portion where that "
        "highlight is discussed.\n"
        "5. Append multiple timestamp pairs for the same highlight using a semicolon (;) as the separator.\n"
        "6. You must output NOTHING BUT the formatted text.\n\n"
        "### Output Format:\n"
        "If the highlight is discussed in one continuous portion:\n"
        "[5-10 Word Title],[Start Time],[End Time]\n\n"
        "If the highlight is discussed in multiple separate portions:\n"
        "[5-10 Word Title],[Start Time 1],[End Time 1];[Start Time 2],[End Time 2]"
    )

    urls = client.models.generate_content(model="gemini-3.5-flash", contents=prompt)
    text = urls.text.strip()
    text = re.sub(r"^```.*?\n", "", text)
    text = re.sub(r"\n```$", "", text)

    results = []
    segments = text.replace("\n", ";").split(";")
    current_title = ""
    for segment in segments:
        segment = segment.strip()
        if not segment:
            continue
        parts = [p.strip() for p in segment.split(",")]
        if len(parts) >= 3:
            current_title = ",".join(parts[:-2])
            results.append([current_title, parts[-2], parts[-1]])
        elif len(parts) == 2 and current_title:
            results.append([current_title, parts[0], parts[1]])
    return results


# ── Formatting helpers ───────────────────────────────────────────────────────

def format_published(iso_string: str) -> str:
    if not iso_string:
        return ""
    try:
        dt = datetime.fromisoformat(iso_string.replace("Z", "+00:00"))
        return dt.strftime("%B %-d, %Y at %-I:%M %p UTC")
    except ValueError:
        return iso_string


def timestamp_to_seconds(ts: str) -> int:
    if not ts:
        return 0
    ts = ts.strip("[] ")
    parts = ts.split(":")
    try:
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
        elif len(parts) == 2:
            return int(parts[0]) * 60 + int(parts[1])
        elif len(parts) == 1:
            return int(parts[0])
    except ValueError:
        return 0
    return 0


def build_email_body(summary_html, title, channel, published, clips, video_id):
    safe_title = html_mod.escape(title or "New YouTube Video")
    safe_channel = html_mod.escape(channel or "")
    pretty_published = html_mod.escape(format_published(published))

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
        clips_html += "<p><b>Interesting Clips</b></p>"
        for clip in clips:
            clip_title, start_ts, end_ts = clip
            start_sec = timestamp_to_seconds(start_ts)
            end_sec = timestamp_to_seconds(end_ts)
            url = f"https://www.youtube.com/watch?v={video_id}&t={start_sec}"
            clips_html += (
                f'<p style="margin-bottom: 4px;"><b>{html_mod.escape(clip_title)}</b></p>'
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


def build_newsletter_body(summary_html, newsletter_name, clips_data):
    safe_name = html_mod.escape(newsletter_name or "Your Newsletter Digest")

    header = (
        f'<h1 style="margin:0 0 16px 0; font-family: Georgia, serif;">{safe_name}</h1>'
        f'<p style="margin:0 0 22px 0; color:#566252;">Here is your curated digest of the latest videos.</p>'
        '<hr style="border: 0; border-top: 1px solid #dce8d5; margin-bottom: 22px;" />'
    )

    clips_html = ""
    if clips_data:
        clips_html += "<p><b>Top Highlights Across All Videos</b></p>"
        for video_id, clips in clips_data.items():
            for clip in clips:
                clip_title, start_ts, end_ts = clip
                start_sec = timestamp_to_seconds(start_ts)
                end_sec = timestamp_to_seconds(end_ts)
                url = f"https://www.youtube.com/watch?v={video_id}&t={start_sec}"
                clips_html += (
                    f'<p style="margin-bottom: 4px;"><b>{html_mod.escape(clip_title)}</b></p>'
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


# ── Email sending ────────────────────────────────────────────────────────────

def send_email(body: str, recipients: list, subject: str = "New YouTube Video Summary"):
    if not recipients:
        print("No recipients provided; skipping send.")
        return
    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(GMAIL_ADDRESS, GMAIL_APP_PASSWORD)
        for recipient in recipients:
            msg = MIMEText(body, "html")
            msg["Subject"] = subject
            msg["From"] = GMAIL_ADDRESS
            msg["To"] = recipient
            server.send_message(msg)
            print(f"Email sent to {recipient}")


# ── Background task runners ──────────────────────────────────────────────────

def _process_single_video(video_id: str, title: str, channel: str, published: str, recipients: list):
    """Background task: fetch transcript, summarize, extract clips, send email."""
    try:
        transcript, transcript_with_timestamps = get_transcript(video_id)
        if not transcript:
            print(f"[{video_id}] No transcript found, skipping.")
            return

        summary = gemini_summarize(transcript)
        clips = gemini_get_clips(summary, transcript_with_timestamps)
        body = build_email_body(summary, title, channel, published, clips, video_id)

        subject_bits = []
        if channel:
            subject_bits.append(channel)
        subject_bits.append(title or "New YouTube Video")
        subject = " — ".join(subject_bits)

        send_email(body, recipients, subject=subject)
        print(f"[{video_id}] Processed and emailed to {len(recipients)} recipients.")
    except Exception as e:
        print(f"[{video_id}] Processing failed: {e}")


def _process_newsletter_digest(video_ids: list, newsletter_name: str, recipients: list):
    """Background task: fetch transcripts for all videos, build digest, send email."""
    try:
        # Fetch video metadata from YouTube API
        video_metadata = {}
        if YT_API_KEY:
            try:
                url = f"https://www.googleapis.com/youtube/v3/videos?part=snippet&id={','.join(video_ids)}&key={YT_API_KEY}"
                req = urllib.request.Request(url)
                with urllib.request.urlopen(req) as response:
                    data = json.loads(response.read().decode())
                    for item in data.get("items", []):
                        video_metadata[item["id"]] = {
                            "title": item["snippet"]["title"],
                            "channel": item["snippet"]["channelTitle"],
                        }
            except Exception as e:
                print(f"Error fetching YouTube metadata: {e}")

        # Get transcripts for all videos
        combined_transcript = ""
        transcripts_with_timestamps = {}
        for vid in video_ids:
            t_str, t_ts = get_transcript(vid)
            if t_str:
                meta = video_metadata.get(vid, {"title": "Unknown Title", "channel": "Unknown Channel"})
                combined_transcript += f"\n\n--- VIDEO: {meta['title']} (Channel: {meta['channel']}) ---\n"
                combined_transcript += t_str
                transcripts_with_timestamps[vid] = t_ts

        if not combined_transcript.strip():
            print("No transcripts found for any videos in the newsletter.")
            return

        # Summarize the combined transcript
        client = gemini.Client(api_key=GEMINI_KEY, http_options={"api_version": "v1beta"})
        prompt = (
            f"You are writing a newsletter digest named '{newsletter_name}'. "
            "Below are the transcripts for several recent YouTube videos. "
            "Please provide a cohesive summary covering the key points from ALL the videos provided. "
            "Format the output strictly as HTML suitable for an email body. "
            "Use headings (<h2>) for each video's summary, and provide a <ul> of actionable takeaways at the end.\n\n"
            "TRANSCRIPTS:\n" + combined_transcript
        )

        summary_response = client.models.generate_content(model="gemini-3.5-flash", contents=prompt)
        summary = summary_response.text.strip()
        summary = re.sub(r"^```(?:html)?\s*", "", summary)
        summary = re.sub(r"\s*```$", "", summary)

        # Get clips
        combined_ts = ""
        for vid, t_ts in transcripts_with_timestamps.items():
            meta = video_metadata.get(vid, {})
            combined_ts += f"\n\n--- VIDEO ID: {vid} ({meta.get('title')}) ---\n"
            combined_ts += t_ts

        clip_prompt = (
            "You are curating highlights for a newsletter. Identify the 3 to 5 absolute best moments "
            "from the following summaries and transcripts.\n\n"
            "Summary:\n" + summary + "\n\n"
            "Transcripts (separated by VIDEO ID markers):\n" + combined_ts + "\n\n"
            "Output exactly 3 to 5 highlights in this format:\n"
            "[Video ID],[5-10 Word Title],[Start Time],[End Time]\n"
        )
        clip_res = client.models.generate_content(model="gemini-3.5-flash", contents=clip_prompt)

        clip_text = clip_res.text.strip()
        clip_text = re.sub(r"^```.*?\n", "", clip_text)
        clip_text = re.sub(r"\n```$", "", clip_text)

        clips_data = {}
        for line in clip_text.split("\n"):
            line = line.strip()
            if not line:
                continue
            parts = [p.strip() for p in line.split(",")]
            if len(parts) >= 4:
                vid, clip_title, start, end = parts[0], parts[1], parts[2], parts[3]
                if vid not in clips_data:
                    clips_data[vid] = []
                clips_data[vid].append([clip_title, start, end])

        body = build_newsletter_body(summary, newsletter_name, clips_data)
        send_email(body, recipients, subject=f"Your {newsletter_name} Digest")
        print(f"[Newsletter: {newsletter_name}] Digest sent to {len(recipients)} recipients.")
    except Exception as e:
        print(f"[Newsletter: {newsletter_name}] Processing failed: {e}")
