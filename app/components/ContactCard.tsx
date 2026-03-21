import Link from "next/link";
import type { ComponentType } from "react";

type ContactIconProps = {
	size?: number | string;
	className?: string;
};

export interface ContactItem {
	contactType: string;
	username: string;
	href: string;
	icon: ComponentType<ContactIconProps>;
}

interface ContactCardProps {
	contact: ContactItem;
}

export default function ContactCard({ contact }: ContactCardProps) {
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
