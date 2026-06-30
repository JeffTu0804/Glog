import { UserRole } from "@prisma/client";
import { Router } from "express";
import { AppError } from "../errors/AppError.js";
import { requireRole } from "../middleware/requireRole.js";
import {
  assignTicket,
  createTicket,
  findTicketForTenant,
  listTickets,
  parseTicketPriority,
  parseTicketStatus,
  updateTicketStatus,
} from "../services/maintenanceTicketService.js";
import {
  closeTicket,
  type CloseTicketInput,
  type InventoryUsage,
} from "../services/ticketClosureService.js";
import {
  parseTicketReportBody,
  resolveFrontDeskEscalation,
  submitTicketReport,
} from "../services/ticketReportService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getParamId, parseOptionalStringArray } from "../utils/validators.js";

export const maintenanceTicketsRouter = Router();

const CREATE_ROLES = [
  UserRole.ADMIN,
  UserRole.FRONT_DESK,
  UserRole.HOUSEKEEPING,
] as const;

function parseCloseTicketBody(body: Record<string, unknown>): CloseTicketInput {
  const { inventoryUsages, laborCost, laborDescription } = body;

  if (!Array.isArray(inventoryUsages)) {
    throw new AppError(400, "inventoryUsages 為必填陣列");
  }

  const parsedUsages: InventoryUsage[] = inventoryUsages.map((item) => {
    if (typeof item !== "object" || item === null) {
      throw new AppError(400, "inventoryUsages 格式無效");
    }
    const { inventoryId, quantity } = item as Record<string, unknown>;
    return {
      inventoryId: typeof inventoryId === "string" ? inventoryId : "",
      quantity: typeof quantity === "number" ? quantity : NaN,
    };
  });

  if (laborCost !== undefined && typeof laborCost !== "number") {
    throw new AppError(400, "laborCost 必須為數字");
  }
  if (laborDescription !== undefined && typeof laborDescription !== "string") {
    throw new AppError(400, "laborDescription 必須為字串");
  }

  return {
    inventoryUsages: parsedUsages,
    laborCost: typeof laborCost === "number" ? laborCost : undefined,
    laborDescription:
      typeof laborDescription === "string" ? laborDescription : undefined,
  };
}

/**
 * POST /api/v1/maintenance-tickets
 * 建立工單並自動派單（前台、房務、管理員）
 */
maintenanceTicketsRouter.post(
  "/",
  requireRole(...CREATE_ROLES),
  asyncHandler(async (req, res) => {
    const { assetId, title, description, priority, requiredSkills } =
      req.body as Record<string, unknown>;

    if (typeof assetId !== "string" || !assetId) {
      throw new AppError(400, "assetId 為必填");
    }
    if (typeof title !== "string" || !title.trim()) {
      throw new AppError(400, "title 為必填");
    }
    if (description !== undefined && typeof description !== "string") {
      throw new AppError(400, "description 必須為字串");
    }

    const result = await createTicket(req.user!.tenantId, req.user!.id, {
      assetId,
      title: title.trim(),
      description:
        typeof description === "string" ? description.trim() : undefined,
      priority:
        priority !== undefined ? parseTicketPriority(priority) : undefined,
      requiredSkills: parseOptionalStringArray(requiredSkills, "requiredSkills"),
    });

    res.status(201).json(result);
  }),
);

/**
 * GET /api/v1/maintenance-tickets
 * 列出本租戶工單，支援 status / assignedToId / assetId 篩選
 */
maintenanceTicketsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { status, assignedToId, assetId } = req.query;

    const tickets = await listTickets(req.user!.tenantId, {
      status:
        status !== undefined ? parseTicketStatus(status) : undefined,
      assignedToId:
        typeof assignedToId === "string" ? assignedToId : undefined,
      assetId: typeof assetId === "string" ? assetId : undefined,
    });

    res.json({ tickets });
  }),
);

/**
 * GET /api/v1/maintenance-tickets/:id
 * 取得單筆工單詳情
 */
maintenanceTicketsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const ticket = await findTicketForTenant(
      req.user!.tenantId,
      getParamId(req.params, "工單 ID"),
    );

    res.json({ ticket });
  }),
);

/**
 * PATCH /api/v1/maintenance-tickets/:id/assign
 * 管理員手動派單給工程師
 */
maintenanceTicketsRouter.patch(
  "/:id/assign",
  requireRole(UserRole.ADMIN),
  asyncHandler(async (req, res) => {
    const { assignedToId } = req.body as { assignedToId?: unknown };

    if (typeof assignedToId !== "string" || !assignedToId) {
      throw new AppError(400, "assignedToId 為必填");
    }

    const ticket = await assignTicket(
      req.user!.tenantId,
      getParamId(req.params, "工單 ID"),
      assignedToId,
    );

    res.json({ ticket });
  }),
);

/**
 * PATCH /api/v1/maintenance-tickets/:id/status
 * 更新工單狀態（工程師：開始作業；管理員：取消）
 */
maintenanceTicketsRouter.patch(
  "/:id/status",
  requireRole(UserRole.ADMIN, UserRole.ENGINEER),
  asyncHandler(async (req, res) => {
    const { status } = req.body as { status?: unknown };
    const nextStatus = parseTicketStatus(status);

    const ticket = await updateTicketStatus(
      req.user!.tenantId,
      getParamId(req.params, "工單 ID"),
      nextStatus,
      { id: req.user!.id, role: req.user!.role },
    );

    res.json({ ticket });
  }),
);

/**
 * POST /api/v1/maintenance-tickets/:id/report
 * 工程師現場回報：完工照片或升級前台協助
 */
maintenanceTicketsRouter.post(
  "/:id/report",
  requireRole(UserRole.ADMIN, UserRole.ENGINEER),
  asyncHandler(async (req, res) => {
    const input = parseTicketReportBody(req.body as Record<string, unknown>);
    const ticket = await submitTicketReport(
      req.user!.tenantId,
      getParamId(req.params, "工單 ID"),
      { id: req.user!.id, role: req.user!.role },
      input,
    );
    res.json({ ticket });
  }),
);

/**
 * POST /api/v1/maintenance-tickets/:id/front-desk-resolve
 * 前台處理升級案件
 */
maintenanceTicketsRouter.post(
  "/:id/front-desk-resolve",
  requireRole(UserRole.ADMIN, UserRole.FRONT_DESK),
  asyncHandler(async (req, res) => {
    const { action, note } = req.body as { action?: unknown; note?: unknown };
    if (action !== "RESUME" && action !== "CLOSE") {
      throw new AppError(400, "action 必須為 RESUME 或 CLOSE");
    }
    if (typeof note !== "string") {
      throw new AppError(400, "note 為必填");
    }
    const ticket = await resolveFrontDeskEscalation(
      req.user!.tenantId,
      getParamId(req.params, "工單 ID"),
      { id: req.user!.id, role: req.user!.role },
      action,
      note,
    );
    res.json({ ticket });
  }),
);

/**
 * PATCH /api/v1/maintenance-tickets/:id/close
 * 工單結案閉環：扣庫存、寫入 CostLog、釋放工程師、恢復資產
 */
maintenanceTicketsRouter.patch(
  "/:id/close",
  requireRole(UserRole.ADMIN, UserRole.ENGINEER),
  asyncHandler(async (req, res) => {
    const input = parseCloseTicketBody(req.body as Record<string, unknown>);

    const ticket = await closeTicket(
      req.user!.tenantId,
      getParamId(req.params, "工單 ID"),
      { id: req.user!.id, role: req.user!.role },
      input,
    );

    res.json({ ticket });
  }),
);
