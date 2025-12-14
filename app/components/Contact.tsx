import { garamond } from "../ui/fonts";

const Contact = () => {
	return (
		<div className="flex flex-col w-full h-full p-6 self-stretch items-start">
			<div className="inline-flex">
				You made it this far... that&apos;s alarming. Might as well{" "}
				<p
					className={`ml-1 -translate-y-1 ${garamond.className} text-xl`}
				>
					contact me.
				</p>
			</div>
			<div>email, instagram, linkedin, github, discord, hc slack</div>
		</div>
	);
};

export default Contact;
