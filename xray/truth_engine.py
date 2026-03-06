#!/usr/bin/env python3
"""
XRAY TRUTH ENGINE v2 - News Verification System
Story-specific verdicts based on source tier, official signals, and content analysis.
Usage: python truth_engine.py [--batch-size N] [--max-stories N]
"""
import urllib.request, json, time, argparse, os, re
from datetime import datetime

SUPABASE_URL = os.environ.get('SUPABASE_URL', '')
SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_KEY", os.environ.get("SERVICE_ROLE_SUPABASE", os.environ.get("SUPABASE_ANON_KEY", "")))

SOURCE_HIGH = ["reuters","associated press","ap news","bbc","bbc news","the guardian",
              "npr","al jazeera","dw","france24","sky news","wall street journal",
              "wsj","euronews","rfi","afp","bloomberg"]
SOURCE_MED  = ["cnn","nbc","abc news","cbs","fox news","politico","the hill",
              "axios","the independent","the telegraph"]

OFFICIAL_SIGNALS = [
    "pentagon","white house","state department","department of defense",
    "nato","united nations","un secretary","european union",
    "ministry of defense","foreign ministry","prime minister",
    "president","spokesperson said","official statement",
    "kremlin","idf","fbi","cia","dod","government announced"
]

VERIF_SIGNALS = [
    "confirmed","announced","declared","signed","approved","passed",
    "killed","died","arrested","launched","deployed","struck",
    "according to","identified","released","published","revealed"
]

REDFLAG_SIGNALS = [
    "could","might","may","possibly","perhaps","allegedly",
    "reportedly","sources say","unconfirmed","speculation",
    "opinion","analysis","editorial","rumored","anonymous sources"
]

SPECIFIC_LOCS = [
    "tehran","washington","moscow","beijing","kyiv","tel aviv",
    "london","paris","berlin","tokyo","damascus","gaza",
    "kabul","baghdad","riyadh","ottawa","new york","jerusalem"
]

def get_headers():
    return {
        "apikey": SERVICE_KEY,
        "Authorization": "Bearer " + SERVICE_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

def get_source_tier(source_name):
    if not source_name: return 0
    s = source_name.lower()
    for n in SOURCE_HIGH:
        if n in s: return 20
    for n in SOURCE_MED:
        if n in s: return 10
    return 0

def count_signals(text, signals):
    t = text.lower()
    return sum(1 for s in signals if s in t)

def extract_entities(text):
    words = re.findall(r"\b[A-Z][a-z]{3,}\b", text)
    skip = {"This","That","They","Their","There","These","After","Before","While","When","Where","With","From","Into","Over","Under"}
    seen, unique = set(), []
    for w in words:
        if w not in skip and w not in seen:
            seen.add(w); unique.append(w)
    return unique[:4]

def build_verdict(score, official_hits, verif_hits, redflag_hits, source_tier, source_name, country):
    src = source_name or "Unknown source"
    loc = (" from " + country) if country else ""
    if score >= 80:
        if official_hits >= 2:
            return f"High confidence. Multiple official sources confirm. Reported by {src}."[:200]
        return f"High confidence. Tier-1 source with {verif_hits} verification signals. {src} reporting{loc}."[:200]
    elif score >= 65:
        if official_hits >= 1:
            return f"Verified. Official confirmation detected. {src} reporting{loc}."[:200]
        return f"Verified. {verif_hits} confirmation signals in {src} report. Details appear factual."[:200]
    elif score >= 50:
        if redflag_hits >= 2:
            return f"Moderate confidence. Speculative language detected ({redflag_hits} flags). Requires corroboration."[:200]
        return f"Moderate confidence. Some verification present in {src} report. Monitor for updates."[:200]
    elif score >= 35:
        if redflag_hits >= 3:
            return f"Low confidence. High speculation ({redflag_hits} red flags). Unverified sourcing."[:200]
        return f"Insufficient verification. Limited official confirmation. Requires corroboration."[:200]
    return f"Unverified. Significant red flags ({redflag_hits}) or unknown source. Exercise caution."[:200]

def analyze(story):
    score        = 38
    headline     = story.get("headline","") or ""
    summary      = story.get("summary","") or ""
    full_text    = story.get("full_text","") or ""
    source_count = story.get("source_count",1) or 1
    source_name  = story.get("source_name","") or ""
    conf_score   = story.get("confidence_score",40) or 40
    is_breaking  = story.get("is_breaking", False)
    country      = story.get("country_name","") or ""
    text         = (headline+" "+summary+" "+full_text).lower()

    tier          = get_source_tier(source_name)
    score        += tier

    if source_count >= 5:   score += 12
    elif source_count >= 3: score += 7
    elif source_count >= 2: score += 3

    official_hits = count_signals(text, OFFICIAL_SIGNALS)
    score        += min(official_hits * 4, 16)

    verif_hits    = count_signals(text, VERIF_SIGNALS)
    score        += min(verif_hits * 3, 12)

    nums          = len(re.findall(r"\b\d+\b", text))
    if nums >= 5:   score += 6
    elif nums >= 2: score += 3

    loc_hits      = sum(1 for l in SPECIFIC_LOCS if l in text)
    score        += min(loc_hits * 2, 6)

    redflag_hits  = count_signals(text, REDFLAG_SIGNALS)
    score        -= min(redflag_hits * 5, 20)

    if is_breaking and tier >= 10: score += 4
    if conf_score >= 75:   score += 6
    elif conf_score >= 55: score += 3

    score   = max(5, min(99, score))
    status  = "verified" if score >= 55 else "unverified"
    verdict = build_verdict(score, official_hits, verif_hits, redflag_hits, tier, source_name, country)
    return score, verdict, status

def run_truth_engine(batch_size=25, max_stories=50):
    print("=" * 60)
    print("XRAY TRUTH ENGINE v2")
    print("Started: " + datetime.now().isoformat())
    print("=" * 60)

    url = SUPABASE_URL + "/rest/v1/stories?select=id&xray_verdict=is.null&limit=1000"
    req = urllib.request.Request(url, headers=get_headers())
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            total = len(json.loads(r.read().decode()))
            print("Stories pending: " + str(total))
    except Exception as e:
        print("Error checking pending: " + str(e))
        total = max_stories

    processed = updated = errors = 0

    for offset in range(0, min(total, max_stories), batch_size):
        url = (SUPABASE_URL + "/rest/v1/stories"
               "?select=id,headline,summary,full_text,source_count,source_name,"
               "confidence_score,is_breaking,status,country_name,country_code"
               "&xray_verdict=is.null&order=created_at.desc"
               "&limit=" + str(batch_size) + "&offset=" + str(offset))
        req = urllib.request.Request(url, headers=get_headers())
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                stories = json.loads(r.read().decode())
                if not stories: break
                for story in stories:
                    sid = story["id"]
                    score, verdict, status = analyze(story)
                    data = json.dumps({
                        "xray_score":   score,
                        "xray_verdict": verdict,
                        "status":       status,
                        "updated_at":   datetime.now().isoformat()
                    }).encode()
                    ureq = urllib.request.Request(
                        SUPABASE_URL + "/rest/v1/stories?id=eq." + sid,
                        data=data, headers=get_headers(), method="PATCH")
                    try:
                        with urllib.request.urlopen(ureq, timeout=10): updated += 1
                        print(f"  [{score:3d}] {story["headline"][:55]:<55} {verdict[:55]}")
                    except Exception as e:
                        errors += 1
                        print("  ERROR " + sid + ": " + str(e)[:60])
                    processed += 1
                    time.sleep(0.05)
        except Exception as e:
            print("  BATCH ERROR offset " + str(offset) + ": " + str(e)[:100])
            break

    print("=" * 60)
    print("Processed: " + str(processed))
    print("Updated:   " + str(updated))
    print("Errors:    " + str(errors))
    print("Finished:  " + datetime.now().isoformat())
    return {"processed": processed, "updated": updated, "errors": errors}

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Xray Truth Engine v2")
    parser.add_argument("--batch-size",  type=int, default=25)
    parser.add_argument("--max-stories", type=int, default=50)
    args = parser.parse_args()
    run_truth_engine(args.batch_size, args.max_stories)
