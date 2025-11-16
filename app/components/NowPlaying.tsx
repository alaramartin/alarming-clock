export default async function NowPlaying() {
	const res = await fetch("http://localhost:3000/api/spotify/now-playing", {
		cache: "no-store",
	});
	const song = await res.json();

	if (!song.isPlaying) return <div>no music playing</div>;

	return <div>{song.title}</div>;
}
