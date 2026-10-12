#!/usr/bin/env python3
"""
Assemble a publishable bundle of the web app.

The point is not the copying — it is the checks. A bundle is refused if anything shipped
references a remote URL, because the public claim is "open the page and the tool is complete".
The manifest lists what a build contains and its hashes, so a deployed copy can be compared
against the source rather than believed.

  ~/.venvs/tools/bin/python tools/build_site.py [--out ../../../artifacts/dist/trimline]
"""
import argparse, hashlib, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))  # .../workspace
PROJ = os.path.join(ROOT, "projects", "trimline")
SHIPPED = ["index.html", "src/rules.js", "src/app.js"]
OPTIONAL = ["rulesets/lean-voice.json", "README.md", "CHANGELOG.md"]
REMOTE = re.compile(r"https?://[^\s\"'<>)]+")
NETWORK = [re.compile(r"\bfetch\s*\("), re.compile(r"XMLHttpRequest"), re.compile(r"WebSocket"),
           re.compile(r"navigator\.sendBeacon"), re.compile(r"<iframe")]

def sha(b):
    return hashlib.sha256(b).hexdigest()

def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(ROOT, "artifacts", "dist", "trimline"))
    a = ap.parse_args()

    version = None
    with open(os.path.join(PROJ, "src", "rules.js")) as f:
        version = re.search(r"version:\s*'([\d.]+)'", f.read()).group(1)

    files, problems, doc_urls, doc_mentions = [], [], set(), set()
    for rel in SHIPPED + OPTIONAL:
        src = os.path.join(PROJ, rel)
        if not os.path.exists(src):
            if rel in SHIPPED:
                problems.append("missing required file: " + rel)
            continue
        raw = open(src, "rb").read()
        text = raw.decode("utf-8", "replace")
        shipped = rel in SHIPPED
        for m in REMOTE.finditer(text):
            # App files must carry no remote URL at all. Docs are instructions and may name a
            # localhost address, so they are reported in the manifest instead of blocking.
            if shipped:
                problems.append("%s references %s" % (rel, m.group(0)))
            else:
                doc_urls.add(m.group(0))
        for rx in NETWORK:
            if rx.search(text):
                # same rule as URLs: an app file may not touch a network API. Documentation that
                # *names* fetch() in prose is description, not a dependency.
                if shipped:
                    problems.append("%s uses a network API (%s)" % (rel, rx.pattern))
                else:
                    doc_mentions.add("%s: %s" % (rel, rx.pattern))
        files.append((rel, raw))

    if problems:
        print("BUILD REFUSED", file=sys.stderr)
        for p in problems:
            print("  - " + p, file=sys.stderr)
        print("  (app files are checked strictly; docs are only reported)", file=sys.stderr)
        return 1

    os.makedirs(a.out, exist_ok=True)
    # the single-file build is generated in this same run, never copied in from an earlier one
    single = subprocess.run(["node", os.path.join(here, "build_single.js"),
                             "--out", os.path.join(a.out, "trimline.html")],
                            capture_output=True, text=True)
    if single.returncode != 0:
        print("single-file build refused:", single.stdout.strip(), single.stderr.strip(), file=sys.stderr)
        sys.exit(1)
    single_path = os.path.join(a.out, "trimline.html")
    with open(single_path, "rb") as f:
        files.append(("trimline.html", f.read()))

    manifest = {"tool": "trimline", "version": version,
                "built_utc": __import__("datetime").datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
                "network_urls_in_bundle": 0,
                "urls_in_docs_only": sorted(doc_urls),
                "network_api_mentions_in_docs": sorted(doc_mentions), "files": []}
    for rel, raw in files:
        dest = os.path.join(a.out, rel)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, "wb") as f:
            f.write(raw)
        manifest["files"].append({"path": rel, "bytes": len(raw), "sha256": sha(raw)})
    with open(os.path.join(a.out, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2, sort_keys=True)

    print("built %s (v%s)" % (a.out, version))
    for e in manifest["files"]:
        print("  %-22s %7d  %s" % (e["path"], e["bytes"], e["sha256"][:12]))
    print("  %-22s %7d" % ("manifest.json", os.path.getsize(os.path.join(a.out, "manifest.json"))))
    return 0

if __name__ == "__main__":
    sys.exit(main())
