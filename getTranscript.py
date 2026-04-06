from dotenv import load_dotenv
import os
from serpapi import GoogleSearch #transcript api
from google import genai as gemini #llm for summary

load_dotenv()
serpKey = os.getenv("serp")
geminiKey = os.getenv("gemini")


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
        contents=("Summarize this video transcript: "+ transcript)
    )
    
    return summary.text

print(geminiSummarize(getTranscript("vd14EElCRvs")))