interface TabProps {
	type: string;
	selected: boolean;
	onTabChange: React.MouseEventHandler<HTMLDivElement>;
}

const Tab = ({ type, selected, onTabChange }: TabProps) => {
	return (
		<div
			className={`cursor-pointer bg-background px-3 py-1 border border-gray-500 rounded-t-lg ${
				selected
					? "border-b-transparent -mb-px z-40"
					: "z-10 opacity-70"
			}`}
			onClick={onTabChange}
		>
			{type}
		</div>
	);
};

export default Tab;
