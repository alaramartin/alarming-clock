interface TabProps {
	type: string;
	selected: boolean;
	onTabChange: React.MouseEventHandler<HTMLDivElement>;
}

const Tab = ({ type, selected, onTabChange }: TabProps) => {
	return (
		<div
			className={`cursor-pointer ${
				!selected && "opacity-70"
			} border-4 border-gray-500 -mb-2 px-2 py-1 ${
				selected &&
				"border-4 -mb-3 border-b-13 border-b-background text-textred"
			} z-1000 rounded-lg`}
			onClick={onTabChange}
		>
			{type}
		</div>
	);
};

export default Tab;
