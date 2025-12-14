export const projects: {
    name: string;
    githubLink: string;
    href?: string;
    miniDescription?: string;
    description: string;
    notes?: string[];
    tags: string[];
    year: number;
    imageFilename?: string;
}[] = [
    {
        name: "PKL Viewer",
        githubLink: "https://github.com/alaramartin/pkl-viewer",
        href: "https://marketplace.visualstudio.com/items?itemName=alarm.pkl-viewer",
        miniDescription:
            "View Python pickle files directly in the VS Code editor.",
        description:
            "View Python pickle (.pkl) files directly in the VS Code editor, quickly and safely.",
        notes: ["3000+ users :)"],
        tags: ["TypeScript", "Python", "VS_Code_API", "HTMLCSS", "JavaScript"],
        year: 2025,
        imageFilename: "pkl-example.png"
    },
    {
        name: "DICOM Viewer",
        githubLink: "https://github.com/alaramartin/dicom-viewer",
        href: "https://marketplace.visualstudio.com/items?itemName=alarm.dicom-viewer",
        miniDescription: "View DICOM images and edit metadata side-by-side.",
        description:
            "View DICOM images and edit metadata side-by-side, right in your VS Code editor.",
        notes: ["250+ users :)", "first vscode extension"],
        tags: ["TypeScript", "JavaScript", "VS_Code_API", "HTMLCSS"],
        year: 2025,
        imageFilename: "dicom-example.png"
    },
    {
        name: "AP Score Reveal",
        githubLink: "https://github.com/alaramartin/ap-score-cover",
        href: "https://chromewebstore.google.com/detail/ap%C2%AE-exam-score-reveal/mhjggldhegkdodlneehpkhpjbgmpohak",
        miniDescription: "Chrome extension to customize score reveals.",
        description:
            "Chrome extension that hides AP scores until clicked and plays custom sounds and animations for each reveal.",
        notes: ["accidentally spoiled my own 2025 AP score reveal by inspecting the HTML to build this extension"],
        tags: [
            "TypeScript",
            "React",
            "Chrome_API",
            "HTMLCSS",
            "TailwindCSS",
        ],
        year: 2025,
        imageFilename: "ap-score-example.png"
    },
    {
        name: "Website",
        githubLink: "https://github.com/alaramartin/website",
        href: "https://alaramartin.vercel.app",
        miniDescription: "supa professional website",
        description: "My more serious, professional website.",
        notes: ["i still don't know how to make it nicer :(", "someone pls teach me ui/ux design"],
        tags: [
            "React",
            "NextJS",
            "TailwindCSS",
            "TypeScript",
            "HTMLCSS",
            "whimsy",
        ],
        year: 2025,
        imageFilename: "website-example.png"
    },
    {
        name: "HIPSTER-AI",
        githubLink: "https://github.com/stanfordaide/hipster-ai",
        miniDescription: "Under 1mm MPJPE. Aura.",
        description:
            "Pediatric acetabular index machine learning cool stuff. Built for Stanford AI Development and Evaluation Lab.",
        notes: ["deployment in progress", "0.98mm MPJPE", "resnet-50 backbone, faster-rcnn-based keypoint detection model"],
        tags: ["PyTorch", "Python", "Git"],
        year: 2025,
    },
    
];