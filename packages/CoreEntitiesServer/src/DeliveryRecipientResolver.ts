/**
 * Reading who an order's document should go to.
 *
 * THE ORDER ALREADY ANSWERS THIS, and that is the whole design. `BillToOrganizationID` and
 * `BillToPersonID` are not incidental references — they are somebody's recorded decision about who is
 * being billed for this order, made when the order was taken. So the billing contacts are the email
 * addresses of exactly those parties, and nothing else on the customer record is eligible. There is no
 * search for "an address we hold for this company", because that search is how an invoice reaches a
 * general enquiries inbox or a former employee, and neither failure is visible from the sending side.
 *
 * BOTH ARE RETURNED WHEN BOTH EXIST. An order billed to a person AT an organisation names both, and
 * both are legitimately expecting the bill — the person because it is addressed to them, the
 * organisation because its accounts-payable address is where invoices are processed. Choosing one
 * would be this module inventing a policy the order did not express; `DeliveryBehavior` de-duplicates
 * them if they turn out to be the same address.
 *
 * WHY NOT ON `InvoicePartyFacts.Email`. That field exists on the rendered document and is deliberately
 * left null by the builder: it is there so a TEMPLATE can print a contact address, which is a
 * presentation concern and may legitimately be a different address from the one the bill is sent to.
 * Wiring delivery to it would couple where a document goes to what it prints.
 *
 * CONNECTS TO:
 *   PURE:  ./DeliveryBehavior.ts — which of these are eligible, and de-duplication
 *   DOC:   plans/bizapps-orders-master.md §4.4, D65
 */
import { RunView, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import type { DeliveryContact } from './DeliveryBehavior.js';

const ORDER_HEADER_ENTITY = 'MJ_BizApps_Orders: Order Headers';
const PERSON_ENTITY = 'MJ_BizApps_Common: People';
const ORGANIZATION_ENTITY = 'MJ_BizApps_Common: Organizations';

/** The bill-to parties an order names. */
interface BillToRow {
    BillToPersonID: string | null;
    BillToOrganizationID: string | null;
    Status: string;
}

/**
 * The contacts an order's document may be delivered to.
 *
 * Returns an EMPTY LIST rather than throwing when nothing is recorded. "Nobody to send to" is a
 * decision `DecideDelivery` makes and reports with a reason a person can act on; a throw here would
 * turn it into a stack trace in a workflow log.
 */
export async function LoadOrderDeliveryContacts(
    orderID: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<DeliveryContact[]> {
    const rv = new RunView(provider as unknown as IRunViewProvider);

    const orderResult = await rv.RunView<BillToRow>(
        {
            EntityName: ORDER_HEADER_ENTITY,
            ExtraFilter: `ID='${orderID}'`,
            Fields: ['BillToPersonID', 'BillToOrganizationID', 'Status'],
            ResultType: 'simple',
        },
        user,
    );

    const order = orderResult?.Results?.[0];
    if (!order) return [];

    // ONE BATCHED PAIR, not two sequential reads — and both are issued even when only one id is set,
    // because a RunViews with an impossible filter costs less than the branching needed to avoid it
    // and keeps the result positions fixed.
    const [people, organizations] = await rv.RunViews(
        [
            {
                EntityName: PERSON_ENTITY,
                ExtraFilter: order.BillToPersonID ? `ID='${order.BillToPersonID}'` : '1=0',
                Fields: ['ID', 'Email', 'FirstName', 'LastName'],
                ResultType: 'simple',
            },
            {
                EntityName: ORGANIZATION_ENTITY,
                ExtraFilter: order.BillToOrganizationID ? `ID='${order.BillToOrganizationID}'` : '1=0',
                Fields: ['ID', 'Email', 'Name'],
                ResultType: 'simple',
            },
        ],
        user,
    );

    const contacts: DeliveryContact[] = [];

    const person = (people?.Results ?? [])[0] as { Email?: string | null; FirstName?: string | null; LastName?: string | null } | undefined;
    if (person?.Email) {
        contacts.push({
            Address: person.Email,
            FullName: [person.FirstName, person.LastName].filter(Boolean).join(' ') || null,
            // 'Billing' because the ORDER named them as the bill-to party. This is not a guess about a
            // general-purpose contact; it is the decision the order already records.
            Purpose: 'Billing',
        });
    }

    const organization = (organizations?.Results ?? [])[0] as { Email?: string | null; Name?: string | null } | undefined;
    if (organization?.Email) {
        contacts.push({ Address: organization.Email, FullName: organization.Name ?? null, Purpose: 'Billing' });
    }

    return contacts;
}

/** The order's status, for the deliverability decision. Null when the order does not exist. */
export async function LoadOrderStatus(
    orderID: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<string | null> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const result = await rv.RunView<{ Status: string }>(
        {
            EntityName: ORDER_HEADER_ENTITY,
            ExtraFilter: `ID='${orderID}'`,
            Fields: ['Status'],
            ResultType: 'simple',
        },
        user,
    );
    return result?.Results?.[0]?.Status ?? null;
}
