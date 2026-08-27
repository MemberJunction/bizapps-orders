import type { FormNavigationEvent } from '@memberjunction/ng-base-forms';
import { NavigationService, SharedService } from '@memberjunction/ng-shared';

/**
 * Dispatches a FormNavigationEvent to NavigationService or SharedService.
 *
 * Ensures all hyperlinks, entity lookups, and grid record clicks in custom forms
 * properly navigate to records in Explorer tabs or open external links.
 */
export function DispatchFormNavigation(
    event: FormNavigationEvent,
    navigationService?: NavigationService | null
): void {
    if (!event) return;

    if (event.Kind === 'record') {
        if (navigationService) {
            navigationService.OpenEntityRecord(event.EntityName, event.PrimaryKey, { forceNewTab: event.OpenInNewTab });
            return;
        }

        try {
            SharedService.Instance.OpenEntityRecord(event.EntityName, event.PrimaryKey);
        } catch (err) {
            console.warn('Could not open entity record via SharedService:', err);
        }
    } else if (event.Kind === 'new-record') {
        if (navigationService) {
            navigationService.OpenNewEntityRecord(event.EntityName, {
                newRecordValues: event.DefaultValues,
                forceNewTab: true,
            });
        }
    } else if (event.Kind === 'entity-hierarchy') {
        if (navigationService) {
            navigationService.OpenEntityRecord(event.EntityName, event.PrimaryKey);
        } else {
            try {
                SharedService.Instance.OpenEntityRecord(event.EntityName, event.PrimaryKey);
            } catch (err) {
                console.warn('Could not open entity hierarchy record via SharedService:', err);
            }
        }
    } else if (event.Kind === 'external-link') {
        window.open(event.Url, event.OpenInNewTab !== false ? '_blank' : '_self');
    } else if (event.Kind === 'email') {
        window.open(`mailto:${event.EmailAddress}`, '_self');
    }
}
