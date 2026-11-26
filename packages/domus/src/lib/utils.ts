import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Merge class names, resolving Tailwind conflicts (last wins). The shadcn `cn` helper.
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
