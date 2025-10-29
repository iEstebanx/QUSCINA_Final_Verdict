// Backend/src/routes/Inventory/ingredients.js
const express = require("express");
const {
  db,
  FieldValue,
} = require("../../shared/firebase/firebaseAdmin");

const router = express.Router();
const COLL = "inventory_ingredients";
const ITEMS_COLL = "items"; // Add this to check for usage in items

/* ---------- helpers ---------- */
const NAME_MAX = 60;
const NAME_ALLOWED = /^[A-Za-z0-9][A-Za-z0-9 .,'&()/-]*$/;
const normalize = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const isValidName = (s) =>
  !!s && s.length > 0 && s.length <= NAME_MAX && NAME_ALLOWED.test(s);
/* -------------------------------- */

/** GET /api/inventory/ingredients - Now sorted by createdAt descending */
router.get("/", async (_req, res) => {
  try {
    // Try to order by createdAt first, fallback to updatedAt or name if needed
    try {
      const snap = await db.collection(COLL).orderBy("createdAt", "desc").get();
      const ingredients = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return res.json({ ok: true, ingredients });
    } catch (orderError) {
      // If createdAt ordering fails, try updatedAt
      console.warn("Ordering by createdAt failed, trying updatedAt:", orderError.message);
      try {
        const snap = await db.collection(COLL).orderBy("updatedAt", "desc").get();
        const ingredients = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        return res.json({ ok: true, ingredients });
      } catch (secondOrderError) {
        // Final fallback: get all and sort manually
        console.warn("Ordering by updatedAt failed, sorting manually:", secondOrderError.message);
        const snap = await db.collection(COLL).get();
        let ingredients = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        
        // Sort by createdAt timestamp, then by updatedAt, then by name as final fallback
        ingredients.sort((a, b) => {
          // Try createdAt first
          const aCreated = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime()) : 0;
          const bCreated = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime()) : 0;
          if (bCreated !== aCreated) return bCreated - aCreated;
          
          // Then try updatedAt
          const aUpdated = a.updatedAt ? (a.updatedAt.toDate ? a.updatedAt.toDate().getTime() : new Date(a.updatedAt).getTime()) : 0;
          const bUpdated = b.updatedAt ? (b.updatedAt.toDate ? b.updatedAt.toDate().getTime() : new Date(b.updatedAt).getTime()) : 0;
          if (bUpdated !== aUpdated) return bUpdated - aUpdated;
          
          // Final fallback: alphabetical
          return (a.name || "").localeCompare(b.name || "");
        });
        
        return res.json({ ok: true, ingredients });
      }
    }
  } catch (e) {
    console.error("[ingredients] list failed:", e);
    res.status(500).json({ ok: false, error: e.message || "List failed" });
  }
});

/** GET /api/inventory/ingredients/:id/usage - Check if ingredient is used in any items */
router.get("/:id/usage", async (req, res) => {
  try {
    const ingredientId = req.params.id;
    
    // Check both ways the ingredient might be stored in items
    const usageRes1 = await db.collection(ITEMS_COLL)
      .where("ingredients", "array-contains", ingredientId)
      .get();
    
    const usageRes2 = await db.collection(ITEMS_COLL)
      .where("ingredients.ingredientId", "==", ingredientId)
      .get();
    
    const allItems = [...usageRes1.docs, ...usageRes2.docs];
    const isUsed = allItems.length > 0;
    const usedInItems = [];
    
    if (isUsed) {
      // Get unique item names
      const itemNames = [...new Set(allItems.map(doc => doc.data().name || "Unnamed Item"))];
      usedInItems.push(...itemNames);
    }
    
    res.json({ 
      ok: true, 
      isUsed,
      usedInItems: usedInItems.slice(0, 5) // Return first 5 items for reference
    });
  } catch (e) {
    console.error("[ingredients] usage check failed:", e);
    res.status(500).json({ ok: false, error: e.message || "Usage check failed" });
  }
});

/** POST /api/inventory/ingredients  { name, category, type } */
router.post("/", async (req, res) => {
  try {
    const name = normalize(req.body?.name);
    const category = normalize(req.body?.category);
    const type = normalize(req.body?.type) || "";

    if (!isValidName(name)) {
      return res.status(400).json({
        ok: false,
        error:
          "Invalid name. Allowed letters, numbers, spaces, and - ' & . , ( ) / (max 60).",
      });
    }
    if (!category) {
      return res.status(400).json({ ok: false, error: "Category is required." });
    }

    const now = FieldValue.serverTimestamp();
    const ref = await db.collection(COLL).add({
      name,
      category,
      type,         // store unit/type
      currentStock: 0,
      lowStock: 0,
      price: 0,
      createdAt: now,
      updatedAt: now,
    });

    res.status(201).json({ ok: true, id: ref.id });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || "Create failed" });
  }
});

/** PATCH /api/inventory/ingredients/:id - Update ingredient */
router.patch("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const updates = {};
    
    if (req.body?.name !== undefined) {
      const name = normalize(req.body.name);
      if (!isValidName(name)) {
        return res.status(400).json({
          ok: false,
          error: "Invalid name. Allowed letters, numbers, spaces, and - ' & . , ( ) / (max 60).",
        });
      }
      updates.name = name;
    }
    
    if (req.body?.category !== undefined) {
      updates.category = normalize(req.body.category);
    }
    
    if (req.body?.type !== undefined) {
      updates.type = normalize(req.body.type);
    }
    
    if (req.body?.currentStock !== undefined) {
      updates.currentStock = Number(req.body.currentStock);
    }
    
    if (req.body?.lowStock !== undefined) {
      updates.lowStock = Number(req.body.lowStock);
    }
    
    if (req.body?.price !== undefined) {
      updates.price = Number(req.body.price);
    }
    
    // Always update the updatedAt timestamp
    updates.updatedAt = FieldValue.serverTimestamp();
    
    await db.collection(COLL).doc(id).update(updates);
    
    res.json({ ok: true, message: "Ingredient updated successfully" });
  } catch (e) {
    console.error("[ingredients] update failed:", e);
    res.status(500).json({ ok: false, error: e.message || "Update failed" });
  }
});

/** DELETE /api/inventory/ingredients/:id - Delete ingredient */
router.delete("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    
    // Check if ingredient is used in any items - two methods:
    // 1. Old way: items.ingredients as array of IDs
    const usageRes1 = await db.collection(ITEMS_COLL)
      .where("ingredients", "array-contains", id)
      .limit(1)
      .get();
    
    // 2. New way: items.ingredients as array of objects with ingredientId
    const usageRes2 = await db.collection(ITEMS_COLL)
      .where("ingredients.ingredientId", "==", id)
      .limit(1)
      .get();
    
    const isUsed = !usageRes1.empty || !usageRes2.empty;
    
    if (isUsed) {
      const allItems = [...usageRes1.docs, ...usageRes2.docs];
      const itemNames = [...new Set(allItems.map(doc => doc.data().name || "Unnamed Item"))];
      return res.status(400).json({ 
        ok: false, 
        error: `Cannot delete ingredient: It is currently used in menu items (${itemNames.join(', ')}).` 
      });
    }
    
    // If not used in any items, proceed with deletion
    await db.collection(COLL).doc(id).delete();
    
    res.json({ ok: true, message: "Ingredient deleted successfully" });
  } catch (e) {
    console.error("[ingredients] delete failed:", e);
    res.status(500).json({ ok: false, error: e.message || "Delete failed" });
  }
});

module.exports = router;