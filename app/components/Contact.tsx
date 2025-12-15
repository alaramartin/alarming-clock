import { garamond } from "../ui/fonts";
import ContactCard from "./ContactCard";
import {
	EnvelopeIcon,
	LinkedinLogoIcon,
	GithubLogoIcon,
	GlobeIcon,
	SlackLogoIcon,
	InstagramLogoIcon,
} from "@phosphor-icons/react";

const contactLinks: {
	contactType: string;
	href: string;
	username: string;
	icon: any; // eslint-disable-line
}[] = [
	{
		contactType: "Email",
		href: "mailto:alara.martin@gmail.com",
		username: "alara.martin@gmail.com",
		icon: EnvelopeIcon,
	},
	{
		contactType: "LinkedIn",
		href: "https://linkedin.com/in/alara-martin",
		username: "alara-martin",
		icon: LinkedinLogoIcon,
	},
	{
		contactType: "GitHub",
		href: "https://github.com/alaramartin",
		username: "alaramartin",
		icon: GithubLogoIcon,
	},
	{
		contactType: "Other Website",
		href: "https://alaramartin.vercel.app",
		username: "alaramartin.vercel.app",
		icon: GlobeIcon,
	},
	{
		contactType: "Slack",
		href: "https://hackclub.enterprise.slack.com/team/U07FCTJULVD",
		username: "alarm",
		icon: SlackLogoIcon,
	},
	{
		contactType: "Instagram",
		href: "https://www.instagram.com/the_alarm.ing/",
		username: "the_alarm.ing",
		icon: InstagramLogoIcon,
	},
];

const Contact = () => {
	return (
		<div className="flex flex-col w-full h-full p-6 self-stretch items-start">
			<div className="inline-flex mb-8">
				You made it this far... that&apos;s alarming. Might as well{" "}
				<p
					className={`ml-1 -translate-y-1 ${garamond.className} text-xl`}
				>
					contact me.
				</p>
			</div>
			<div className="grid grid-cols-3 w-full h-5/7">
				{contactLinks.map((contact, index) => (
					<ContactCard key={index} contact={contact}></ContactCard>
				))}
			</div>
		</div>
	);
};

export default Contact;
