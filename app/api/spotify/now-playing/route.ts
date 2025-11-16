import { getNowPlaying } from "../spotify";

export async function GET() {
	try {
		const response = await getNowPlaying();

		if (!response) {
			return Response.json({ isPlaying: false });
		}

		if (response.status === 204 || response.status > 400) {
			return Response.json({ isPlaying: false });
		}

		const song = await response.json().catch(() => null);

		if (!song || !song.item) {
			return Response.json({ isPlaying: false });
		}

		return Response.json({
			album: song.item.album.name,
			albumImageUrl: song.item.album.images?.[0]?.url ?? "",
			artist: song.item.artists.map((a: { name: string }) => a.name).join(", "),
			isPlaying: song.is_playing,
			songUrl: song.item.external_urls.spotify,
			title: song.item.name,
		});
	} catch (error) {
		console.error("Error in now-playing API:", error);
		return Response.json({ isPlaying: false });
	}
}
