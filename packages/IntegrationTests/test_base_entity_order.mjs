import sql from 'mssql';
import { setupSQLServerClient, SQLServerProviderConfigData } from '@memberjunction/sqlserver-dataprovider';
import { UserCache } from '@memberjunction/generic-database-provider';
import { Metadata, RunView, LogError, LogStatus } from '@memberjunction/core';
import { IdentityClaimEngine } from '@memberjunction/core-entities';
import '@mj-biz-apps/common-entities';
import '@mj-biz-apps/orders-entities';
import '@mj-biz-apps/orders-core-entities-server';

async function test() {
    console.log('🔌 Connecting to SQL Server via setupSQLServerClient...');
    const pool = await sql.connect({
        server: 'localhost',
        port: 1433,
        user: 'sa',
        password: 'KRiUffvIjuP5GoLtxYvVkWIQ1BxHQEEMO7j4T684oPR7',
        database: 'bizapps_orders',
        options: { trustServerCertificate: true }
    });

    const configData = new SQLServerProviderConfigData(pool, '__mj', 0);
    const provider = await setupSQLServerClient(configData, { mode: 'minimal' });

    const contextUser = UserCache.Instance.GetSystemUser() || UserCache.Instance.Users.find(u => u.IsActive);
    console.log('✅ Provider initialized! Context user:', contextUser?.Name || contextUser?.Email);

    const md = new Metadata();

    // 1. Create Person via BaseEntity
    console.log('👤 Resolving/creating Person via BaseEntity...');
    const rv = new RunView();
    const email = 'janet.doer.arch@example.com';
    const personCheck = await rv.RunView({
        EntityName: 'MJ_BizApps_Common: People',
        ExtraFilter: `Email = '${email}'`,
        ResultType: 'entity_object'
    }, contextUser);

    let person;
    if (personCheck.Success && personCheck.Results && personCheck.Results.length > 0) {
        person = personCheck.Results[0];
        console.log('Found existing Person:', person.ID);
    } else {
        person = await md.GetEntityObject('MJ_BizApps_Common: People', contextUser);
        person.NewRecord();
        person.FirstName = 'Janet';
        person.LastName = 'Doer';
        person.Email = email;
        person.Title = 'Chief AI Architect';
        const savedPerson = await person.Save();
        if (!savedPerson) {
            console.error('Person Save Result:', JSON.stringify(person.LatestResult, null, 2));
            throw new Error(`Failed to save Person via BaseEntity: ${person.LatestResult?.Message || person.LatestResult?.Error}`);
        }
        console.log('✅ Saved Person via BaseEntity:', person.ID, person.FirstName, person.LastName);
    }

    // 2. Fetch Product via RunView
    const prodRes = await rv.RunView({
        EntityName: 'MJ_BizApps_Orders: Products',
        ExtraFilter: "SKU = 'CONF-2027'",
        ResultType: 'entity_object'
    }, contextUser);
    const product = prodRes.Results[0];
    console.log('Found Product:', product.ID, product.Name);

    // 3. Create Draft Order via BaseEntity with Order Line
    console.log('📦 Creating Order with Line via BaseEntity...');
    const order = await md.GetEntityObject('MJ_BizApps_Orders: Order Headers', contextUser);
    order.NewRecord();
    order.CompanyID = product.CompanyID;
    order.BillToPersonID = person.ID;
    order.Status = 'Draft';
    order.Origin = 'Widget';
    order.OrderType = 'Sale';
    order.SourceCheckoutWidgetID = 'A11C0000-0000-0000-0000-000000000001';
    order.OrderDate = new Date();

    const line = await md.GetEntityObject('MJ_BizApps_Orders: Order Lines', contextUser);
    line.NewRecord();
    line.ProductID = product.ID;
    line.CompanyID = product.CompanyID;
    line.LineNumber = 1;
    line.Quantity = 1;
    line.UnitPrice = 275.00;
    line.Description = `${person.FirstName} ${person.LastName} (${person.Email})`;
    order.Lines.Add(line);

    const savedOrder = await order.Save();
    console.log('savedOrder return value:', savedOrder);
    if (!savedOrder) {
        console.error('❌ ORDER SAVE FAILED. Message:', order.LatestResult?.Message);
        console.error('❌ Errors array:', order.LatestResult?.Errors);
        throw new Error(`Failed to save Order Header: ${order.LatestResult?.Message}`);
    }
    console.log('✅ Saved Draft Order via BaseEntity:', order.ID, order.OrderNumber);

    // 4. Confirm Order via BaseEntity (triggers booking, GL entries, entitlements lifecycle!)
    console.log('🎯 Confirming Order via BaseEntity...');
    order.Status = 'Confirmed';
    order.ConfirmedAt = new Date();
    const confirmed = await order.Save();
    if (!confirmed) {
        console.error('❌ CONFIRM FAILED:', order.LatestResult?.Message);
        throw new Error(`Failed to confirm Order: ${order.LatestResult?.Message}`);
    }
    console.log('🎉 Confirmed Order via BaseEntity lifecycle:', order.OrderNumber, order.Status);

    // 5. Mint IdentityClaim via IdentityClaimEngine
    console.log('🔐 Minting Identity Claim via IdentityClaimEngine...');
    const orderEntityInfo = md.EntityByName('MJ_BizApps_Orders: Order Headers');
    const claim = await IdentityClaimEngine.Instance.CreateClaim({
        ClaimTypeName: 'EntitlementGrant',
        NormalizedEmail: email,
        EntityID: orderEntityInfo.ID,
        RecordID: order.ID,
        ExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        Payload: { OrderID: order.ID, ProductID: product.ID, OrderNumber: order.OrderNumber }
    }, contextUser);
    console.log('✅ Minted Identity Claim via Engine:', claim?.ID);

    await pool.close();
    console.log('\n🌟 100% BaseEntity & Engine Lifecycle Verified! 🌟');
    process.exit(0);
}

test().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
