#!/usr/bin/env python3
"""
Xray Enhanced Analysis Engine v2.0
Performs comprehensive web research to generate in-depth story analysis.
"""

import os
import sys
import json
import requests
import re
from datetime import datetime
from urllib.parse import quote_plus
import time


# Load environment from .env file
def load_env():
    env_path = "/a0/usr/.env"
    try:
        with open(env_path, "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    os.environ[key.strip()] = val.strip()
    except:
        pass

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://dkxydhuojaspmbpjfyoz.supabase.co")
SERVICE_KEY = os.environ.get("SERVICE_ROLE_SUPABASE") or os.environ.get("SERVICE_ROLE_SUBABASE") or ""


HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json"
}

def extract_entities(headline, summary=""):
    text = f"{headline} {summary}"
    countries = {
        "Israel": "Israel", "Iran": "Iran", "Ukraine": "Ukraine", "Russia": "Russia",
        "China": "China", "US": "United States", "United States": "United States",
        "UK": "United Kingdom", "Britain": "United Kingdom", "France": "France",
        "Germany": "Germany", "Japan": "Japan", "Korea": "Korea", "India": "India",
        "Pakistan": "Pakistan", "Turkey": "Turkey", "Saudi": "Saudi Arabia",
        "UAE": "UAE", "Egypt": "Egypt", "Lebanon": "Lebanon", "Syria": "Syria",
        "Gaza": "Gaza", "Palestinian": "Palestinian", "Hezbollah": "Hezbollah",
        "Hamas": "Hamas", "NATO": "NATO", "EU": "European Union"
    }
    found_countries = []
    for key, val in countries.items():
        if key.lower() in text.lower():
            if val not in found_countries:
                found_countries.append(val)
    people = re.findall(r"\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b", text)
    quotes = re.findall(r'"([^"]+)"', text)
    actions = re.findall(r"\b(killed|attacked|launched|struck|invaded|withdrew|signed|announced|confirmed|denied|reported|claimed)\b", text.lower())
    return {"countries": found_countries[:3], "people": list(set(people))[:2], "quotes": quotes[:1], "actions": list(set(actions))[:3]}

def web_search(query, max_results=5):
    try:
        url = f"https://html.duckduckgo.com/html/?q={quote_plus(query)}"
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        resp = requests.get(url, headers=headers, timeout=15)
        resp.raise_for_status()
        results = []
        pattern = r'<a rel="nofollow" class="result__a" href="([^"]+)"[^>]*>([^<]+)</a>'
        matches = re.findall(pattern, resp.text)
        for url, title in matches[:max_results]:
            if "uddg=" in url:
                actual_url = url.split("uddg=")[-1].split("&")[0]
                actual_url = requests.utils.unquote(actual_url)
            else:
                actual_url = url
            results.append({"title": title.strip(), "url": actual_url})
        return results
    except Exception as e:
        return []

def fetch_article_content(url):
    try:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        text = resp.text
        text = re.sub(r"<script[^>]*>.*?</script>", "", text, flags=re.DOTALL|re.IGNORECASE)
        text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL|re.IGNORECASE)
        paragraphs = re.findall(r"<p[^>]*>([^<]+)</p>", text)
        content = " ".join(paragraphs)
        content = re.sub(r"<[^>]+>", "", content)
        content = re.sub(r"\s+", " ", content)
        return content[:2000] if len(content) > 2000 else content
    except:
        return ""

def generate_comprehensive_analysis(story):
    headline = story.get("headline", "")
    summary = story.get("summary", "")
    print("      Researching: " + headline[:60] + "...")
    entities = extract_entities(headline, summary)
    all_content = []
    sources_consulted = []

    print("      [1/3] Searching main story...")
    results = web_search(headline, max_results=3)
    for r in results:
        content = fetch_article_content(r["url"])
        if content and len(content) > 200:
            all_content.append(content)
            sources_consulted.append(r["title"])
            time.sleep(0.5)

    if entities["countries"]:
        action = entities["actions"][0] if entities["actions"] else "conflict"
        context_query = " ".join(entities["countries"][:2]) + " " + action + " history background"
        print("      [2/3] Searching context...")
        results = web_search(context_query, max_results=2)
        for r in results:
            content = fetch_article_content(r["url"])
            if content and len(content) > 200:
                all_content.append(content)
                sources_consulted.append(r["title"])
                time.sleep(0.5)

    if entities["people"]:
        people_query = entities["people"][0] + " latest news today"
        print("      [3/3] Searching developments...")
        results = web_search(people_query, max_results=2)
        for r in results:
            content = fetch_article_content(r["url"])
            if content and len(content) > 200:
                all_content.append(content)
                sources_consulted.append(r["title"])
                time.sleep(0.5)

    combined_text = " ".join(all_content)
    analysis_parts = []

    analysis_parts.append("**WHAT HAPPENED:** " + (summary if summary else headline))

    if entities["countries"]:
        context = "**CONTEXT:** This development involves " + ", ".join(entities["countries"]) + ". "
        if entities["people"]:
            context += "Key figures include " + ", ".join(entities["people"]) + ". "
        analysis_parts.append(context)

    if len(combined_text) > 500:
        sentences = combined_text.split(".")
        background_sentences = []
        keywords = ["history", "background", "previously", "earlier", "decades", "years", "long-standing", "ongoing", "conflict", "tensions"]
        for s in sentences:
            if any(kw in s.lower() for kw in keywords):
                background_sentences.append(s.strip())
        if background_sentences:
            bg_text = ". ".join(background_sentences[:2])
            analysis_parts.append("**BACKGROUND:** " + bg_text + ".")

    if entities["actions"]:
        analysis_parts.append("**WHY IT MATTERS:** This " + ", ".join(entities["actions"]) + " could have significant implications for regional stability and international relations.")

    if sources_consulted:
        sources_str = " | ".join(sources_consulted[:4])
        analysis_parts.append("**SOURCES CONSULTED:** " + sources_str)

    final_analysis = "\n\n".join(analysis_parts)
    if len(final_analysis) > 1500:
        final_analysis = final_analysis[:1500] + "..."
    return final_analysis

def get_stories_for_analysis(limit=10):
    url = f"{SUPABASE_URL}/rest/v1/stories?select=id,headline,summary,country_code,xray_analysis&xray_analysis=is.null&order=created_at.desc&limit={limit}"
    resp = requests.get(url, headers=HEADERS)
    resp.raise_for_status()
    return resp.json()

def update_story_analysis(story_id, analysis):
    url = f"{SUPABASE_URL}/rest/v1/stories?id=eq.{story_id}"
    data = {"xray_analysis": analysis, "xray_analysis_at": datetime.utcnow().isoformat(), "xray_analysis_version": 2}
    resp = requests.patch(url, headers=HEADERS, json=data)
    resp.raise_for_status()
    return True

def main(limit=10):
    print("")
    print("="*60)
    print("XRAY ENHANCED ANALYSIS ENGINE v2.0")
    print("="*60)
    print("Started: " + datetime.now().isoformat())
    print("Limit: " + str(limit))
    print("="*60)
    print("")

    if not SUPABASE_URL or not SERVICE_KEY:
        print("ERROR: Missing SUPABASE_URL or SERVICE_ROLE_SUPABASE")
        sys.exit(1)

    stories = get_stories_for_analysis(limit)
    if not stories:
        print("No stories need analysis.")
        return

    print("Found " + str(len(stories)) + " stories for analysis")
    print("")

    analyzed = 0
    for i, story in enumerate(stories, 1):
        try:
            hl = story["headline"]
            headline = hl[:50] + "..." if len(hl) > 50 else hl
            print("[" + str(i) + "/" + str(len(stories)) + "] Processing: " + headline)
            analysis = generate_comprehensive_analysis(story)
            update_story_analysis(story["id"], analysis)
            print("      Done. Analysis: " + str(len(analysis)) + " chars")
            analyzed += 1
        except Exception as e:
            print("      Error: " + str(e))

    print("")
    print("="*60)
    print("COMPLETE: Analyzed " + str(analyzed) + "/" + str(len(stories)) + " stories")
    print("="*60)

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args()
    main(limit=args.limit)
