import { NON_INTERACTIVE_ROLES } from "../constants/aria-roles.js";

export const isNonInteractiveRole = (role: string): boolean => NON_INTERACTIVE_ROLES.has(role);
