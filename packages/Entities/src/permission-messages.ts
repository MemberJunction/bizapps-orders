/**
 * Wording for a refusal a person reads when an action's authorization is missing
 * (bc-aidp-next-golive#493). A message on screen says what the person cannot do, who can, and what
 * to do next. It never names an authorization, an operation, a setting or an entity: those go to
 * the log, where an administrator reads them.
 */
import { LogError } from '@memberjunction/core';

/**
 * The refusal for an action whose authorization was never installed, so nobody holds it.
 * Logs the authorization and how to install it, and returns the sentence for the screen.
 *
 * @param action what is refused, as the start of a sentence: "Refunding a payment".
 * @param authorization the authorization's name, for the log only.
 */
export function PermissionNotSetUp(action: string, authorization: string): string {
    LogError(
        `${action} was refused: the ${authorization} authorization is not installed, so nobody holds it. ` +
            `Sync the BizApps Orders metadata to install it.`,
    );
    return `${action} isn't available yet because its permission hasn't been set up. Please contact your administrator.`;
}
