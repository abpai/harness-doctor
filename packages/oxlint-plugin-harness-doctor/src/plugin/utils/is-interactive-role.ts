import { INTERACTIVE_ROLES } from "../constants/aria-roles.js";

// Port of `oxc_linter::utils::react::is_interactive_role`. Returns
// true when `role` is a WAI-ARIA interactive role (button, checkbox,
// link, …).
export const isInteractiveRole = (role: string): boolean => INTERACTIVE_ROLES.has(role);
