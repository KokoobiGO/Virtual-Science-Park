import { expect, test as setup } from "@playwright/test";
import { MEMBER, MEMBER_STATE, STAFF, STAFF_STATE, signInThroughForm } from "./helpers";

/**
 * Sign in once per role through the real form and keep the session for the
 * other tests. The state files hold session cookies, so they live in
 * e2e/.auth/, which is git-ignored. Never use "Sign out" in this suite: it
 * ends the account's sessions everywhere, including other people's.
 */
setup("sign in as the member demo account", async ({ page }) => {
  await page.goto("/sign-in");
  await signInThroughForm(page, MEMBER.email);
  await expect(page).toHaveURL(/\/week$/);
  await page.context().storageState({ path: MEMBER_STATE });
});

setup("sign in as the staff demo account", async ({ page }) => {
  await page.goto("/sign-in");
  await signInThroughForm(page, STAFF.email);
  await expect(page).toHaveURL(/\/staff\/compare$/);
  await page.context().storageState({ path: STAFF_STATE });
});
