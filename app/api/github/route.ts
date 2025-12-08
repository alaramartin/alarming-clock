import { NextResponse } from "next/server";

export async function GET() {
    const res = await fetch(`https://api.github.com/users/alaramartin/events?no-cache=${Date.now()}`, {
        headers: {
            "Accept": "application/vnd.github+json",
            "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`,
            "User-Agent": "alara"
        }
    });

    if (!res.ok) {
        return NextResponse.json({error: "github api error"}, {status: 500});
    }

    // get recent events (trying to get PushEvents)
    const events = await res.json();
    const pushEvent = events.find((e: any) => e.type === "PushEvent"); // eslint-disable-line

    if (!pushEvent) {
        return NextResponse.json({message: "no push events (for some reason...)"});
    }

    return NextResponse.json({
        repo: pushEvent.repo.name,
        sha: pushEvent.payload.head.substring(0, 7),
        timestamp: pushEvent.created_at
    });
}