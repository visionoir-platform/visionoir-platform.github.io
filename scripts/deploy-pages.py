"""Deploy this run's uploaded Pages artifact using the documented GitHub API.

The Pages action's internal artifact list returned no entries for two runs
where the REST API had indexed the upload. Use the indexed artifact ID.
"""
import json
import os
import time
import urllib.error
import urllib.request

api = os.environ["GITHUB_API_URL"]
repo = os.environ["GITHUB_REPOSITORY"]
run = os.environ["GITHUB_RUN_ID"]
sha = os.environ["GITHUB_SHA"]
base = f"{api}/repos/{repo}"


def request(url, token, payload=None):
    body = json.dumps(payload).encode() if payload is not None else None
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "Visionoir-Pages-Workflow",
    }
    with urllib.request.urlopen(urllib.request.Request(url, data=body, headers=headers), timeout=20) as response:
        return json.load(response)


def main():
    token = os.environ["GH_TOKEN"]
    for _ in range(20):
        artifacts = request(f"{base}/actions/runs/{run}/artifacts?name=github-pages",token)["artifacts"]
        eligible = [entry for entry in artifacts if entry["name"] == "github-pages" and not entry["expired"]]
        if eligible:
            artifact_id = max(entry["id"] for entry in eligible)
            break
        time.sleep(3)
    else:
        raise SystemExit("GitHub did not index the Pages artifact.")

    identity = request(os.environ["ACTIONS_ID_TOKEN_REQUEST_URL"],os.environ["ACTIONS_ID_TOKEN_REQUEST_TOKEN"])["value"]
    publication = request(f"{base}/pages/deployments",token,{
        "artifact_id":artifact_id,"pages_build_version":sha,"oidc_token":identity,
        "environment":"github-pages",
    })
    deployment_id = publication.get("id") or sha
    print(f"Pages deployment {deployment_id}",flush=True)
    deadline = time.monotonic()+540
    while time.monotonic()<deadline:
        time.sleep(7)
        try:
            status = request(f"{base}/pages/deployments/{deployment_id}",token)["status"]
        except (urllib.error.URLError,TimeoutError):
            continue
        if status == "succeed":
            with open(os.environ["GITHUB_OUTPUT"],"a") as stream:
                stream.write(f"page_url={publication['page_url']}\n")
            print("Published",publication["page_url"])
            return
        if status in {"deployment_failed","deployment_content_failed","deployment_cancelled","deployment_lost"}:
            raise SystemExit(f"Pages reported {status}")
    raise SystemExit("Pages publication did not complete within nine minutes.")


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as error:
        # The request body includes the transient OIDC token. Do not echo it.
        raise SystemExit(f"GitHub API returned HTTP {error.code}.") from None
