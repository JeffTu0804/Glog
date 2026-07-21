/**
 * Supabase (PostgreSQL) → MongoDB Atlas 完整搬遷腳本
 *
 * 規範：
 * - 依依賴順序搬遷
 * - idMap：舊 UUID/cuid → 新 ObjectId
 * - 外鍵自動 remapping
 * - Date / JSONB / array 型別轉置
 * - 冪等：每 collection 先 deleteMany({})
 * - 雙向筆數驗證 + 錯誤詳情
 *
 * 執行：cd backend && node scripts/migrate.js
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MongoDB_connection_string_url ||
  process.env.MONGODB_URI;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ 缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!MONGO_URI) {
  console.error('❌ 缺少 MONGO_URI（或 MongoDB_connection_string_url）');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** @type {Record<string, import('mongoose').Types.ObjectId>} */
const idMap = {};

/** @type {Array<{ table: string; rowId: string; error: string }>} */
const errorLogs = [];

/** @type {Array<{ emoji: string; label: string; supabaseCount: number; mongoCount: number; ok: boolean }>} */
const verifyResults = [];

const PAGE_SIZE = 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pick(row, ...keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null) return row[k];
    // also try if value is explicitly null and key exists
    if (Object.prototype.hasOwnProperty.call(row, k)) return row[k];
  }
  return undefined;
}

function toDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`無法解析日期: ${JSON.stringify(value)}`);
  }
  return d;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  const n = Number(value);
  if (Number.isNaN(n)) throw new Error(`無法解析數字: ${JSON.stringify(value)}`);
  return n;
}

function remapId(oldId, fieldName, { required = false } = {}) {
  if (oldId === null || oldId === undefined || oldId === '') {
    if (required) throw new Error(`必要外鍵 ${fieldName} 為空`);
    return null;
  }
  const mapped = idMap[String(oldId)];
  if (!mapped) {
    throw new Error(`idMap 找不到 ${fieldName}=${oldId}`);
  }
  return mapped;
}

/**
 * 預先為整批列配置 ObjectId，讓同表自引用外鍵也可一次 remapping
 */
function preassignIds(rows, getLegacyId) {
  for (const row of rows) {
    const legacyId = String(getLegacyId(row));
    if (!idMap[legacyId]) {
      idMap[legacyId] = new ObjectId();
    }
  }
}

async function fetchAllRows(tableName) {
  const all = [];
  let from = 0;
  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const { data, error, count } = await supabase
      .from(tableName)
      .select('*', { count: 'exact' })
      .range(from, to);

    if (error) {
      throw new Error(`讀取 Supabase.${tableName} 失敗: ${error.message}`);
    }
    const batch = data || [];
    all.push(...batch);
    if (batch.length < PAGE_SIZE) {
      // prefer exact count when available
      if (typeof count === 'number' && all.length < count) {
        from += PAGE_SIZE;
        continue;
      }
      break;
    }
    from += PAGE_SIZE;
  }
  return all;
}

async function countSupabase(tableName) {
  const { count, error } = await supabase
    .from(tableName)
    .select('*', { count: 'exact', head: true });
  if (error) throw new Error(`計數 Supabase.${tableName} 失敗: ${error.message}`);
  return count ?? 0;
}

async function migrateCollection(config) {
  const {
    emoji,
    label,
    supabaseTable,
    mongoCollection,
    getLegacyId,
    transform,
    compositeKey,
  } = config;

  console.log(`\n── ${emoji} ${label} (${supabaseTable} → ${mongoCollection}) ──`);

  const col = mongoose.connection.collection(mongoCollection);
  const deleted = await col.deleteMany({});
  console.log(`   冪等清空: 刪除 ${deleted.deletedCount} 筆舊資料`);

  let rows;
  try {
    rows = await fetchAllRows(supabaseTable);
  } catch (err) {
    console.error(`   ❌ 讀取失敗: ${err.message}`);
    errorLogs.push({ table: supabaseTable, rowId: '-', error: err.message });
    verifyResults.push({
      emoji,
      label,
      supabaseCount: -1,
      mongoCount: await col.countDocuments(),
      ok: false,
    });
    return;
  }

  console.log(`   Supabase 讀取: ${rows.length} 筆`);

  if (rows.length === 0) {
    const sb = await countSupabase(supabaseTable);
    const mg = await col.countDocuments();
    verifyResults.push({
      emoji,
      label,
      supabaseCount: sb,
      mongoCount: mg,
      ok: sb === mg,
    });
    console.log(`   （空表，略過寫入）`);
    return;
  }

  if (compositeKey) {
    for (const row of rows) {
      const key = compositeKey(row);
      if (!idMap[key]) idMap[key] = new ObjectId();
    }
  } else {
    preassignIds(rows, getLegacyId);
  }

  const docs = [];
  for (const row of rows) {
    const legacyId = compositeKey ? compositeKey(row) : String(getLegacyId(row));
    try {
      const base = transform(row);
      const doc = {
        _id: idMap[legacyId],
        legacyId: compositeKey ? legacyId : getLegacyId(row),
        ...base,
      };
      // 清除 undefined，保留 null
      for (const k of Object.keys(doc)) {
        if (doc[k] === undefined) delete doc[k];
      }
      docs.push(doc);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`   ❌ row legacyId=${legacyId}: ${msg}`);
      errorLogs.push({ table: supabaseTable, rowId: legacyId, error: msg });
    }
  }

  if (docs.length > 0) {
    try {
      await col.insertMany(docs, { ordered: false });
    } catch (err) {
      // ordered:false 可能部分成功；記錄詳細 writeErrors
      const writeErrors = err?.writeErrors || [];
      if (writeErrors.length) {
        for (const we of writeErrors) {
          const msg = we.errmsg || we.err?.message || String(we);
          console.error(`   ❌ insertMany: ${msg}`);
          errorLogs.push({
            table: supabaseTable,
            rowId: String(we.err?.op?._id || we.index || '?'),
            error: msg,
          });
        }
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`   ❌ insertMany 失敗: ${msg}`);
        errorLogs.push({ table: supabaseTable, rowId: '-', error: msg });
      }
    }
  }

  const sbCount = await countSupabase(supabaseTable);
  const mgCount = await col.countDocuments();
  const ok = sbCount === mgCount && docs.length === rows.length;
  verifyResults.push({
    emoji,
    label,
    supabaseCount: sbCount,
    mongoCount: mgCount,
    ok,
  });
  console.log(
    `   寫入 MongoDB: ${mgCount} 筆 | 轉換成功 ${docs.length}/${rows.length}`,
  );
}

// ---------------------------------------------------------------------------
// Table configs（依賴順序）
// ---------------------------------------------------------------------------

const TABLES = [
  // 1. 獨立／根表
  {
    emoji: '👤',
    label: 'Profiles',
    supabaseTable: 'profiles',
    mongoCollection: 'profiles',
    getLegacyId: (r) => r.id,
    transform: (r) => ({
      email: r.email ?? null,
      name: r.name ?? null,
      role: r.role ?? 'user',
      managerAccessStatus: pick(r, 'manager_access_status', 'managerAccessStatus') ?? 'none',
      managerRequestedAt: toDate(pick(r, 'manager_requested_at', 'managerRequestedAt')),
      managerReviewedAt: toDate(pick(r, 'manager_reviewed_at', 'managerReviewedAt')),
      managerReviewedBy: (() => {
        const v = pick(r, 'manager_reviewed_by', 'managerReviewedBy');
        if (v == null) return null;
        return remapId(v, 'managerReviewedBy');
      })(),
      createdAt: toDate(pick(r, 'created_at', 'createdAt')) || new Date(),
      updatedAt: toDate(pick(r, 'updated_at', 'updatedAt')) || new Date(),
    }),
  },
  {
    emoji: '🛡️',
    label: 'PlatformAdmins',
    supabaseTable: 'PlatformAdmin',
    mongoCollection: 'platformAdmins',
    getLegacyId: (r) => r.id,
    transform: (r) => ({
      // Auth UUID 保留原字串，不走 idMap
      supabaseUserId: r.supabaseUserId,
      email: r.email,
      name: r.name,
      createdAt: toDate(r.createdAt) || new Date(),
      updatedAt: toDate(r.updatedAt) || new Date(),
    }),
  },
  {
    emoji: '🏢',
    label: 'Tenants',
    supabaseTable: 'Tenant',
    mongoCollection: 'tenants',
    getLegacyId: (r) => r.id,
    transform: (r) => ({
      name: r.name,
      slug: r.slug,
      contactEmail: r.contactEmail ?? null,
      plan: r.plan ?? 'TRIAL',
      subscriptionStatus: r.subscriptionStatus ?? 'TRIAL',
      subscriptionEndsAt: toDate(r.subscriptionEndsAt),
      createdAt: toDate(r.createdAt) || new Date(),
      updatedAt: toDate(r.updatedAt) || new Date(),
    }),
  },

  // 2. 依賴 Tenant
  {
    emoji: '👥',
    label: 'Users',
    supabaseTable: 'User',
    mongoCollection: 'users',
    getLegacyId: (r) => r.id,
    transform: (r) => ({
      tenantId: remapId(r.tenantId, 'tenantId', { required: true }),
      supabaseUserId: r.supabaseUserId, // Auth UUID 保留
      email: r.email,
      name: r.name,
      role: r.role,
      status: r.status ?? 'IDLE',
      accountStatus: r.accountStatus ?? 'ACTIVE',
      positionLevel: r.positionLevel ?? 'STAFF',
      skills: Array.isArray(r.skills) ? r.skills : [],
      lineUserId: r.lineUserId ?? null,
      createdAt: toDate(r.createdAt) || new Date(),
      updatedAt: toDate(r.updatedAt) || new Date(),
    }),
  },
  {
    emoji: '🔧',
    label: 'Assets',
    supabaseTable: 'Asset',
    mongoCollection: 'assets',
    getLegacyId: (r) => r.id,
    transform: (r) => ({
      tenantId: remapId(r.tenantId, 'tenantId', { required: true }),
      name: r.name,
      code: r.code,
      type: r.type,
      status: r.status ?? 'OPERATIONAL',
      location: r.location ?? null,
      description: r.description ?? null,
      createdAt: toDate(r.createdAt) || new Date(),
      updatedAt: toDate(r.updatedAt) || new Date(),
    }),
  },
  {
    emoji: '📦',
    label: 'Inventory',
    supabaseTable: 'Inventory',
    mongoCollection: 'inventory',
    getLegacyId: (r) => r.id,
    transform: (r) => ({
      tenantId: remapId(r.tenantId, 'tenantId', { required: true }),
      name: r.name,
      sku: r.sku ?? null,
      category: r.category ?? null,
      quantity: r.quantity ?? 0,
      unit: r.unit ?? '個',
      unitCost: toNumber(r.unitCost),
      reorderLevel: r.reorderLevel ?? 0,
      createdAt: toDate(r.createdAt) || new Date(),
      updatedAt: toDate(r.updatedAt) || new Date(),
    }),
  },
  {
    emoji: '🏨',
    label: 'Hotels',
    supabaseTable: 'hotels',
    mongoCollection: 'hotels',
    getLegacyId: (r) => r.id,
    transform: (r) => ({
      tenantId: remapId(pick(r, 'tenant_id', 'tenantId'), 'tenantId', {
        required: true,
      }),
      name: r.name,
      lineOfficialToken: pick(r, 'line_official_token', 'lineOfficialToken') ?? null,
      createdAt: toDate(pick(r, 'created_at', 'createdAt')) || new Date(),
    }),
  },

  // 3. 依賴 User / Asset
  {
    emoji: '🎫',
    label: 'MaintenanceTickets',
    supabaseTable: 'MaintenanceTicket',
    mongoCollection: 'maintenanceTickets',
    getLegacyId: (r) => r.id,
    transform: (r) => ({
      tenantId: remapId(r.tenantId, 'tenantId', { required: true }),
      assetId: remapId(r.assetId, 'assetId', { required: true }),
      triggeredById: remapId(r.triggeredById, 'triggeredById', { required: true }),
      assignedToId: remapId(r.assignedToId, 'assignedToId'),
      title: r.title,
      description: r.description ?? null,
      status: r.status ?? 'OPEN',
      priority: r.priority ?? 'MEDIUM',
      triggeredAt: toDate(r.triggeredAt) || new Date(),
      assignedAt: toDate(r.assignedAt),
      completedAt: toDate(r.completedAt),
      closedAt: toDate(r.closedAt),
      resolutionNote: r.resolutionNote ?? null,
      resolutionType: r.resolutionType ?? null,
      resolutionAt: toDate(r.resolutionAt),
      frontDeskNote: r.frontDeskNote ?? null,
      createdAt: toDate(r.createdAt) || new Date(),
      updatedAt: toDate(r.updatedAt) || new Date(),
    }),
  },
  {
    emoji: '💰',
    label: 'CostLogs',
    supabaseTable: 'CostLog',
    mongoCollection: 'costLogs',
    getLegacyId: (r) => r.id,
    transform: (r) => ({
      tenantId: remapId(r.tenantId, 'tenantId', { required: true }),
      ticketId: remapId(r.ticketId, 'ticketId'),
      description: r.description,
      amount: toNumber(r.amount),
      category: r.category ?? null,
      recordedAt: toDate(r.recordedAt) || new Date(),
      createdAt: toDate(r.createdAt) || new Date(),
      updatedAt: toDate(r.updatedAt) || new Date(),
    }),
  },
  {
    emoji: '📎',
    label: 'TicketAttachments',
    supabaseTable: 'TicketAttachment',
    mongoCollection: 'ticketAttachments',
    getLegacyId: (r) => r.id,
    transform: (r) => ({
      tenantId: remapId(r.tenantId, 'tenantId', { required: true }),
      ticketId: remapId(r.ticketId, 'ticketId', { required: true }),
      uploadedById: remapId(r.uploadedById, 'uploadedById', { required: true }),
      url: r.url,
      mimeType: r.mimeType ?? 'image/jpeg',
      kind: r.kind,
      createdAt: toDate(r.createdAt) || new Date(),
    }),
  },
  {
    emoji: '📒',
    label: 'ShiftLogbooks',
    supabaseTable: 'ShiftLogbook',
    mongoCollection: 'shiftLogbooks',
    getLegacyId: (r) => r.id,
    transform: (r) => ({
      tenantId: remapId(r.tenantId, 'tenantId', { required: true }),
      department: r.department ?? 'FRONT_DESK',
      shiftType: r.shiftType,
      shiftDate: toDate(r.shiftDate),
      shiftStart: toDate(r.shiftStart),
      shiftEnd: toDate(r.shiftEnd),
      status: r.status ?? 'OPEN',
      aiSummary: r.aiSummary ?? null,
      highlights: Array.isArray(r.highlights) ? r.highlights : [],
      openItems: Array.isArray(r.openItems) ? r.openItems : [],
      snapshotJson: r.snapshotJson ?? null,
      createdById: remapId(r.createdById, 'createdById', { required: true }),
      publishedById: remapId(r.publishedById, 'publishedById'),
      publishedAt: toDate(r.publishedAt),
      createdAt: toDate(r.createdAt) || new Date(),
      updatedAt: toDate(r.updatedAt) || new Date(),
    }),
  },
  {
    emoji: '📝',
    label: 'ShiftLogEntries',
    supabaseTable: 'ShiftLogEntry',
    mongoCollection: 'shiftLogEntries',
    getLegacyId: (r) => r.id,
    transform: (r) => ({
      tenantId: remapId(r.tenantId, 'tenantId', { required: true }),
      logbookId: remapId(r.logbookId, 'logbookId', { required: true }),
      authorId: remapId(r.authorId, 'authorId', { required: true }),
      content: r.content,
      visibility: r.visibility ?? 'INTERNAL',
      sharedWith: Array.isArray(r.sharedWith) ? r.sharedWith : [],
      routingReason: r.routingReason ?? null,
      urgency: r.urgency ?? 'LOW',
      sourceDepartment: r.sourceDepartment ?? null,
      routingGroupId: r.routingGroupId ?? null,
      isRoutedMirror: r.isRoutedMirror ?? false,
      createdAt: toDate(r.createdAt) || new Date(),
    }),
  },
  {
    emoji: '✅',
    label: 'ShiftHandoverAcks',
    supabaseTable: 'ShiftHandoverAck',
    mongoCollection: 'shiftHandoverAcks',
    getLegacyId: (r) => r.id,
    transform: (r) => ({
      tenantId: remapId(r.tenantId, 'tenantId', { required: true }),
      sourceLogbookId: remapId(r.sourceLogbookId, 'sourceLogbookId', {
        required: true,
      }),
      itemType: r.itemType,
      itemIndex: r.itemIndex,
      completedById: remapId(r.completedById, 'completedById', { required: true }),
      completedAt: toDate(r.completedAt) || new Date(),
    }),
  },
  {
    emoji: '🛎️',
    label: 'ServiceRequests',
    supabaseTable: 'ServiceRequest',
    mongoCollection: 'serviceRequests',
    getLegacyId: (r) => r.id,
    transform: (r) => ({
      tenantId: remapId(r.tenantId, 'tenantId', { required: true }),
      type: r.type ?? 'RESTAURANT_RESERVATION',
      status: r.status ?? 'PENDING',
      title: r.title,
      description: r.description ?? null,
      guestRoom: r.guestRoom,
      guestName: r.guestName,
      targetDepartment: r.targetDepartment,
      sourceDepartment: r.sourceDepartment ?? 'FRONT_DESK',
      createdById: remapId(r.createdById, 'createdById', { required: true }),
      handledById: remapId(r.handledById, 'handledById'),
      scheduledAt: toDate(r.scheduledAt),
      reminderAt: toDate(r.reminderAt),
      responseNote: r.responseNote ?? null,
      confirmedAt: toDate(r.confirmedAt),
      rejectedAt: toDate(r.rejectedAt),
      acceptedAt: toDate(r.acceptedAt),
      completionPhotoUrl: r.completionPhotoUrl ?? null,
      source: r.source ?? 'web',
      createdAt: toDate(r.createdAt) || new Date(),
      updatedAt: toDate(r.updatedAt) || new Date(),
    }),
  },

  // 4. 住客 QR / 跨部門
  {
    emoji: '🚪',
    label: 'Rooms',
    supabaseTable: 'rooms',
    mongoCollection: 'rooms',
    getLegacyId: (r) => r.id,
    transform: (r) => ({
      hotelId: remapId(pick(r, 'hotel_id', 'hotelId'), 'hotelId', { required: true }),
      assetId: remapId(pick(r, 'asset_id', 'assetId'), 'assetId'),
      roomNumber: pick(r, 'room_number', 'roomNumber'),
      qrToken: pick(r, 'qr_token', 'qrToken'),
      createdAt: toDate(pick(r, 'created_at', 'createdAt')) || new Date(),
    }),
  },
  {
    emoji: '👷',
    label: 'Employees',
    supabaseTable: 'employees',
    mongoCollection: 'employees',
    getLegacyId: (r) => r.id,
    transform: (r) => ({
      lineUserId: pick(r, 'line_user_id', 'lineUserId'),
      hotelId: remapId(pick(r, 'hotel_id', 'hotelId'), 'hotelId', { required: true }),
      name: r.name,
      department: r.department,
      createdAt: toDate(pick(r, 'created_at', 'createdAt')) || new Date(),
    }),
  },
  {
    emoji: '🙋',
    label: 'GuestRequests',
    supabaseTable: 'guest_requests',
    mongoCollection: 'guestRequests',
    getLegacyId: (r) => r.id,
    transform: (r) => ({
      hotelId: remapId(pick(r, 'hotel_id', 'hotelId'), 'hotelId', { required: true }),
      roomId: remapId(pick(r, 'room_id', 'roomId'), 'roomId', { required: true }),
      requestType: pick(r, 'request_type', 'requestType'),
      targetDepartment: pick(r, 'target_department', 'targetDepartment'),
      status: r.status ?? 'pending',
      notes: r.notes ?? null,
      handledById: remapId(pick(r, 'handled_by_id', 'handledById'), 'handledById'),
      completedAt: toDate(pick(r, 'completed_at', 'completedAt')),
      createdAt: toDate(pick(r, 'created_at', 'createdAt')) || new Date(),
    }),
  },
  {
    emoji: '🔔',
    label: 'Reminders',
    supabaseTable: 'Reminder',
    mongoCollection: 'reminders',
    getLegacyId: (r) => r.id,
    transform: (r) => ({
      tenantId: remapId(r.tenantId, 'tenantId', { required: true }),
      serviceRequestId: remapId(r.serviceRequestId, 'serviceRequestId'),
      maintenanceTicketId: remapId(r.maintenanceTicketId, 'maintenanceTicketId'),
      guestRequestId: remapId(r.guestRequestId, 'guestRequestId'),
      title: r.title,
      message: r.message,
      remindAt: toDate(r.remindAt),
      status: r.status ?? 'SCHEDULED',
      notifyDepartment: r.notifyDepartment ?? 'FRONT_DESK',
      triggeredAt: toDate(r.triggeredAt),
      dismissedAt: toDate(r.dismissedAt),
      createdAt: toDate(r.createdAt) || new Date(),
    }),
  },
  {
    emoji: '📋',
    label: 'CrossDeptTickets',
    supabaseTable: 'tickets',
    mongoCollection: 'crossDepartmentTickets',
    getLegacyId: (r) => r.id,
    transform: (r) => ({
      hotelId: remapId(pick(r, 'hotel_id', 'hotelId'), 'hotelId', { required: true }),
      caseNumber: pick(r, 'case_number', 'caseNumber') ?? null,
      fromDepartment: pick(r, 'from_department', 'fromDepartment'),
      toDepartment: pick(r, 'to_department', 'toDepartment'),
      createdByEmployeeId: remapId(
        pick(r, 'created_by_employee_id', 'createdByEmployeeId'),
        'createdByEmployeeId',
        { required: true },
      ),
      handledByEmployeeId: remapId(
        pick(r, 'handled_by_employee_id', 'handledByEmployeeId'),
        'handledByEmployeeId',
      ),
      description: r.description,
      status: r.status ?? 'pending',
      delayReason: pick(r, 'delay_reason', 'delayReason') ?? null,
      createdAt: toDate(pick(r, 'created_at', 'createdAt')) || new Date(),
      updatedAt: toDate(pick(r, 'updated_at', 'updatedAt')) || new Date(),
    }),
  },
  {
    emoji: '🔢',
    label: 'DailySequences',
    supabaseTable: 'daily_sequences',
    mongoCollection: 'dailySequences',
    getLegacyId: (r) => `${pick(r, 'hotel_id', 'hotelId')}|${pick(r, 'date')}`,
    compositeKey: (r) => `${pick(r, 'hotel_id', 'hotelId')}|${pick(r, 'date')}`,
    transform: (r) => ({
      hotelId: remapId(pick(r, 'hotel_id', 'hotelId'), 'hotelId', { required: true }),
      date: toDate(r.date),
      currentValue: pick(r, 'current_value', 'currentValue') ?? 0,
    }),
  },
  {
    emoji: '📢',
    label: 'HotelNotices',
    supabaseTable: 'hotel_notices',
    mongoCollection: 'hotelNotices',
    getLegacyId: (r) => r.id,
    transform: (r) => ({
      tenantId: remapId(pick(r, 'tenant_id', 'tenantId'), 'tenantId', {
        required: true,
      }),
      type: r.type,
      status: r.status ?? 'UNREAD',
      title: r.title,
      content: r.content ?? null,
      expiresAt: toDate(pick(r, 'expires_at', 'expiresAt')),
      targetDepartment: pick(r, 'target_department', 'targetDepartment') ?? null,
      guestRoom: pick(r, 'guest_room', 'guestRoom') ?? null,
      createdById: remapId(pick(r, 'created_by_id', 'createdById'), 'createdById', {
        required: true,
      }),
      createdAt: toDate(pick(r, 'created_at', 'createdAt')) || new Date(),
      updatedAt: toDate(pick(r, 'updated_at', 'updatedAt')) || new Date(),
    }),
  },
  {
    emoji: '💬',
    label: 'ChatMessages',
    supabaseTable: 'chat_messages',
    mongoCollection: 'chatMessages',
    getLegacyId: (r) => r.id,
    transform: (r) => ({
      tenantId: remapId(pick(r, 'tenant_id', 'tenantId'), 'tenantId', {
        required: true,
      }),
      staffUserId: remapId(pick(r, 'staff_user_id', 'staffUserId'), 'staffUserId'),
      lineUserId: pick(r, 'line_user_id', 'lineUserId') ?? null,
      sender: r.sender,
      messageType: pick(r, 'message_type', 'messageType'),
      content: r.content,
      // ticketId 可能指向多種實體；若在 idMap 則 remap，否則保留原字串
      ticketId: (() => {
        const v = pick(r, 'ticket_id', 'ticketId');
        if (v == null) return null;
        return idMap[String(v)] || v;
      })(),
      ticketKind: pick(r, 'ticket_kind', 'ticketKind') ?? null,
      isRead: pick(r, 'is_read', 'isRead') ?? false,
      createdAt: toDate(pick(r, 'created_at', 'createdAt')) || new Date(),
    }),
  },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  glog：Supabase → MongoDB Atlas 資料搬遷');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Supabase: ${SUPABASE_URL}`);
  console.log(`MongoDB:  ${MONGO_URI.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@')}`);

  await mongoose.connect(MONGO_URI);
  console.log('✅ 已連線 MongoDB Atlas');
  console.log('✅ 已建立 Supabase client（Service Role，繞過 RLS）');

  for (const cfg of TABLES) {
    await migrateCollection(cfg);
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  完整性雙向驗證');
  console.log('═══════════════════════════════════════════════════');

  let allOk = true;
  for (const v of verifyResults) {
    const mark = v.ok ? '✅ 吻合' : '❌ 不吻合';
    if (!v.ok) allOk = false;
    console.log(
      `${v.emoji} ${v.label}: Supabase (${v.supabaseCount} 筆) ➔ MongoDB (${v.mongoCount} 筆) [${mark}]`,
    );
  }

  if (errorLogs.length > 0) {
    console.log('\n═══════════════════════════════════════════════════');
    console.log(`  Error Logs（共 ${errorLogs.length} 筆）`);
    console.log('═══════════════════════════════════════════════════');
    for (const e of errorLogs) {
      console.log(`  • [${e.table}] row=${e.rowId}`);
      console.log(`    ${e.error}`);
    }
  } else {
    console.log('\n✅ 無 row 級錯誤');
  }

  console.log(`\nidMap 條目數: ${Object.keys(idMap).length}`);
  console.log(
    allOk && errorLogs.length === 0
      ? '\n🎉 搬遷完成：全部吻合且無錯誤'
      : '\n⚠️ 搬遷完成，但存在不吻合或錯誤，請檢查上方 Log',
  );

  await mongoose.disconnect();
  process.exit(allOk && errorLogs.length === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('\n💥 致命錯誤:', err);
  try {
    await mongoose.disconnect();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
