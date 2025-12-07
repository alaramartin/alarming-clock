import { NextResponse } from "next/server";

export async function GET() {
    const username = "alaramartin";

    const res = await fetch(`https://api.github.com/users/${username}/events`, {
        headers: {
            "Accept": "application/vnd.github+json"
        }
    });

    if (!res.ok) {
        return NextResponse.json({error: "github api error"}, {status: 500});
    }

    // get recent events (trying to get PushEvents)
    const events = await res.json();
    const pushEvents = events.find((e: any) => e.type === "PushEvent"); // eslint-disable-line

    if (!pushEvents) {
        return NextResponse.json({message: "no push events (for some reason...)"});
    }

    // get the most recent commit from most recent push
    const lastCommit = pushEvents.payload.commits.at(-1);

    return NextResponse.json({
        repo: pushEvents.repo.name,
        sha: lastCommit.sha,
        message: lastCommit.message,
        url: lastCommit.url,
        timestamp: pushEvents.created_at
    });
}