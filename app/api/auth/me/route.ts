import { getSessionUser } from "../../../auth";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  return Response.json({ user });
}
