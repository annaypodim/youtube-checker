# youtube-checker

Polls a YouTube channel via the YouTube Data API v3 for new uploads, fetches the transcript, summarizes it with Gemini, and emails the summary.

## Setup

```
npm install
pip install -r requirements.txt
```

## API Keys

Create a `.env` file with the following keys:

### YouTube Data API v3 (upload polling)
1. In Google Cloud Console, enable the "YouTube Data API v3" for your project
2. Create an API key under APIs & Services → Credentials

```
YT_API_KEY=your_key_here
YT_CHANNEL_ID=UC_x5XG1OV2P6uZZ5FSM9Ttw
```

### SerpAPI (transcript fetching)
1. Create a free account at https://serpapi.com/dashboard
2. Your API key is on the dashboard after signing in

```
serp=your_key_here
```

### Gemini (summarization)
1. Go to https://aistudio.google.com/
2. Click "Get API key" and create one

```
gemini=your_key_here
```

### Gmail (email notifications, optional)
1. Enable 2-step verification on your Google account at https://myaccount.google.com/security
2. Generate an app password at https://myaccount.google.com/apppasswords
3. Name it anything (e.g. "youtube-checker")

```
GMAIL_ADDRESS=you@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
NOTIFY_EMAIL=recipient@example.com
```

If you skip Gmail setup, comment out `sendEmail(summary)` in `getTranscript.py` to avoid errors.

## Usage

Test the transcript + summary standalone:
```
python getTranscript.py <video_id>
```

Run the full pipeline (polls for new uploads, then fetches transcript + emails summary):
```
npm start
```
