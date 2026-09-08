import { authorizeStaff } from "./staff-auth";

export async function authorizeManager(request: Request) {
  return authorizeStaff(request, ["MANAGER"]);
}
