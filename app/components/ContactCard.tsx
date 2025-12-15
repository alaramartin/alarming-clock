import Link from "next/link";

type Contact = {
	contactType: string;
	href: string;
	username: string;
	icon: React.ElementType;
};

interface ContactProps {
	contact: Contact;
}

export default function ContactCard({ contact }: ContactProps) {
	const IconComponent = contact.icon;
	return (
		<div className="flex w-full">
			<Link
				href={contact.href}
				target="_blank"
				rel="noopener noreferrer"
				className="flex flex-col w-full group items-center justify-center"
			>
				<div className="text-textred">
					<IconComponent size={32} />
				</div>
				<p className="group-hover:underline">{contact.contactType}</p>
				<p className="text-xs text-gray-400">{contact.username}</p>
			</Link>
		</div>
	);
}
