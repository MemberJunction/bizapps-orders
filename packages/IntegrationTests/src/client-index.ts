/**
 * Client-safe entry. Do NOT import the main barrel — it loads *Server classes.
 */
import { LoadGeneratedEntities as LoadCommon } from '@mj-biz-apps/common-entities';
import { LoadGeneratedEntities as LoadOrders } from '@mj-biz-apps/orders-entities';

LoadCommon();
LoadOrders();

import './checks/wire-crud.checks.js';
import './checks/wire-volume.checks.js';

export function LoadOrdersClientIntegrationTests(): void {}
