import localFont from "next/font/local"
import { EB_Garamond } from "next/font/google";

export const digital = localFont({ src: './digital-7.ttf' });

export const garamond = EB_Garamond({
    subsets: ["latin"], weight: ['400']
});