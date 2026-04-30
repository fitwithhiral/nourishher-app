import { useState, useEffect, useRef } from "react";

// ─── CONFIG ───
const SB_URL = "https://fimsmaafruzbpoibepua.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpbXNtYWFmcnV6YnBvaWJlcHVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNTcyNDUsImV4cCI6MjA5MTgzMzI0NX0.K6RZY9nb8NEcB9yFP4KJXlHyamXa5pFuPA-cmfbnQbI";
const STRIPE_LINK = "https://buy.stripe.com/bJe3cvaiy2atd6LfZv38402";
const INSTAGRAM_LINK = "https://www.instagram.com/fitwithhiral/";
const MAX_FREE_GENS = 3;
const MAX_PAID_GENS = 10;
const FREE_ACCESS_DAYS = 7;
const PAID_ACCESS_DAYS = 28;

// ─── THEME ───
const C = { bg:"#FFF9F5", bgW:"#FFF0E8", coral:"#E8735A", coralL:"#F09880", peach:"#F4A77A", peachL:"#FBDCC8", blush:"#FFE4D6", rose:"#C4687A", gold:"#D4A057", dk:"#1A1A1A", mt:"#6B5E5A", mtL:"#9B8E8A", wh:"#FFFFFF", gr:"#7CB88A", grL:"#E8F5EC", bl:"#5BA4CF" };
const CSS = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap');
*{box-sizing:border-box;margin:0;padding:0}body{margin:0;font-family:'DM Sans',sans-serif}::-webkit-scrollbar{width:0;height:0}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
@keyframes glow{0%,100%{box-shadow:0 0 20px ${C.coral}20}50%{box-shadow:0 0 30px ${C.coral}40}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes bounceIn{0%{transform:scale(0.3);opacity:0}50%{transform:scale(1.05)}70%{transform:scale(0.95)}100%{transform:scale(1);opacity:1}}
@keyframes slideUp{from{transform:translateY(30px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes fadeScale{from{transform:scale(0.95);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes tickPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.2)}}
@keyframes urgentPulse{0%,100%{opacity:1}50%{opacity:0.7}}
.bounce-in{animation:bounceIn 0.6s ease}
.slide-up{animation:slideUp 0.5s ease forwards}
.fade-scale{animation:fadeScale 0.4s ease}
input:focus{outline:none;border-color:${C.coral}!important}`;

// ─── SUPABASE ───
const sbHeaders = { "Content-Type":"application/json", apikey:SB_KEY, Authorization:`Bearer ${SB_KEY}` };
async function sbInsert(t, d) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${t}`, { method:"POST", headers:{...sbHeaders, Prefer:"return=representation,resolution=merge-duplicates"}, body:JSON.stringify(d) });
    const j = await r.json(); return j?.[0] || null;
  } catch(e) { console.warn("DB insert error:", e); return null; }
}
async function sbUpdate(t, id, d) {
  try { await fetch(`${SB_URL}/rest/v1/${t}?id=eq.${id}`, { method:"PATCH", headers:sbHeaders, body:JSON.stringify(d) }); } catch(e) { console.warn("DB update:", e); }
}
async function sbFind(t, col, val) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${t}?${col}=eq.${encodeURIComponent(val)}&order=created_at.desc&limit=1`, { headers:sbHeaders });
    const j = await r.json(); return j?.[0] || null;
  } catch { return null; }
}

async function sbFindAll(t, col, val) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${t}?${col}=eq.${encodeURIComponent(val)}&order=created_at.desc`, { headers:sbHeaders });
    return await r.json() || [];
  } catch { return []; }
}

// ─── MAILCHIMP (via Vercel serverless function) ───
async function mailchimpSubscribe(email, name) {
  console.log("📧 Adding to Mailchimp:", email, name);
  try {
    const r = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, name: name })
    });
    if (r.ok) {
      console.log("✅ Mailchimp subscribed successfully");
      return true;
    } else {
      const err = await r.text();
      console.warn("❌ Mailchimp error:", r.status, err);
      return false;
    }
  } catch(e) {
    console.warn("❌ Mailchimp failed:", e.message);
    return false;
  }
}

// ─── AI PLAN GENERATION ───
// weekOnly: if specified (1,2,3,4), generates ONLY that week (faster, cheaper, more reliable)
// otherwise: generates 7 days (free) or 28 days (paid full plan)
async function aiGenerate(answers, isPaid = false, weekOnly = null) {
  console.log("🤖 Starting AI generation...", weekOnly ? `(Week ${weekOnly} only)` : "(full plan)");
  const apiKey = import.meta.env.VITE_ANTHROPIC_KEY;
  console.log("🔑 API key present?", apiKey ? "YES (length: " + apiKey.length + ", starts with: " + apiKey.substring(0,10) + "...)" : "NO");
  if (!apiKey) { console.warn("❌ No API key found in environment — using fallback"); return null; }

  // Determine total days for this generation request
  const totalDays = weekOnly ? 7 : (isPaid ? 28 : 7);
  const planLabel = weekOnly ? `Week ${weekOnly} (7-day)` : (isPaid ? "28-day (4 weeks)" : "7-day");
  const startDayOfPlan = weekOnly ? ((weekOnly - 1) * 7 + 1) : 1;
  const weekNum = weekOnly || 1;
  const cuisines = Array.isArray(answers.cuisine) ? answers.cuisine : (answers.cuisine ? [answers.cuisine] : []);
  const cuisineStr = cuisines.length > 0 ? cuisines.join(", ") : "varied";
  console.log("📋 Generating " + planLabel + " plan for:", answers);

  // Goal-specific workout guidance
  const workoutGuidance = {
    "Lose Weight": "Mix of HIIT, cardio intervals, full-body strength circuits, and active recovery. Focus on calorie burn and metabolic conditioning. 5 workout days + 2 rest.",
    "Build Strength": "Progressive strength training with compound lifts (squats, deadlifts, rows, presses). Split by muscle groups. 4-5 workout days + 2-3 rest.",
    "Balance Hormones": "Low-impact strength, yoga, walking, Pilates. Avoid overtraining. Gentle cardio only. 3-4 workout days + 3-4 rest/yoga days.",
    "Improve Digestion": "Gentle yoga, walking, core work, breathwork, light strength. Low intensity. 3-4 workout days + 3-4 active recovery days."
  };

  const dietArr = dietToArray(answers.diet);
  const dietStr = dietArr.length > 0 ? dietArr.join(" AND ") : "balanced";
  const dietDefs = {
    "Vegan": "no animal products",
    "Lacto-Vegetarian": "dairy ok, no eggs/meat/fish",
    "Lacto-Ovo Vegetarian": "dairy + eggs ok, no meat/fish",
    "Eggetarian": "veg + eggs only",
    "Jain": "strict veg, no root veg (onion/garlic/potato), no eggs",
    "Pescatarian": "veg + fish only",
    "Pollotarian": "chicken only, no red meat/fish",
    "Non-Vegetarian": "all proteins ok"
  };
  const dietRules = dietArr.length > 0
    ? `MUST respect: ${dietArr.map(d => `${d} (${dietDefs[d] || "as named"})`).join(" + ")}. Strictest interpretation.`
    : "Balanced diet";

  const p = `Create a personalized ${planLabel} meal + workout plan. Return ONLY valid JSON, no markdown.

USER: ${answers.goal} goal, ${dietStr}, ${answers.fitness} fitness, ${answers.time} cook time, focus: ${(answers.focus||[]).join(", ") || "general"}
WORKOUT: ${workoutGuidance[answers.goal] || "Balanced mix of strength, cardio, recovery."}
CUISINES: ${cuisineStr}. Mix authentic dishes from these cuisines.

DIET RULES: ${dietRules}

OTHER RULES:
- ${totalDays} unique days (NO meal repeats across days)
- 4 meals/day: Breakfast, Lunch, Snack, Dinner
- 3-5 ingredients per recipe, EVERY one starts with quantity (e.g. "200g paneer", "1 cup spinach", "2 tbsp oil") — never just "paneer"
- 3 brief instructions per recipe (keep concise)
- High protein (25-40g per main meal)
- Calorie totals must match the ingredients listed
- Workouts: ${answers.fitness} level, 1-2 rest/recovery days per week
- Each exercise MUST include "modification" field with a safer easier version (1 short sentence)

JSON FORMAT:
{
  "meal_plan": [
    {"day":"Monday","week":${weekNum},"dayOfPlan":${startDayOfPlan},"meals":[
      {"time":"Breakfast","name":"X","emoji":"🥣","cal":380,"protein":"24g","carbs":"42g","fat":"14g","prep_time":"15 min","desc":"brief","ingredients":["200g item","1 cup item","2 tbsp item"],"instructions":["step1","step2","step3"]},
      {"time":"Lunch",...},
      {"time":"Snack",...},
      {"time":"Dinner",...}
    ]}
  ],
  "workout_plan": [
    {"day":"Monday","week":${weekNum},"dayOfPlan":${startDayOfPlan},"name":"X","icon":"🦵","duration":"30 min","exercises":[{"name":"X","detail":"3×12","modification":"Easier version: do this seated/wall-supported instead. Brief description."}]}
  ],
  "grocery_list": [
    {"category":"🥬 Produce","items":["a","b"]},
    {"category":"🍗 Proteins","items":["a","b"]},
    {"category":"🌾 Grains","items":["a","b"]},
    {"category":"🥜 Pantry","items":["a","b"]}
  ]
}

${weekOnly ? `Generate exactly 7 days for Week ${weekOnly} only. Days numbered ${startDayOfPlan}-${startDayOfPlan + 6}, all with week:${weekNum}.` : ""}
Keep descriptions brief. Keep instructions to 3 short steps. Every day of the ${totalDays}-day plan must have unique recipes.
The grocery_list must reflect ALL ingredients used across ALL ${totalDays} days in this plan.`;

  try {
    console.log("📡 Calling Anthropic API...");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 120-second timeout

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: weekOnly ? 20000 : (isPaid ? 60000 : 20000),
        messages: [{ role: "user", content: p }]
      })
    });
    clearTimeout(timeoutId);
    console.log("📥 API responded with status:", r.status);

    if (!r.ok) {
      const errTxt = await r.text();
      console.warn("❌ AI API error:", r.status, errTxt);
      return null;
    }

    const d = await r.json();
    console.log("✅ Got response. Stop reason:", d.stop_reason, "| Tokens used:", d.usage?.output_tokens);
    if (d.stop_reason === "max_tokens") {
      console.warn("⚠️ Response hit max_tokens limit — was cut off!");
    }
    const txt = d.content?.map(function(b) { return b.text || ""; }).join("") || "";
    console.log("📝 Raw AI text (first 200 chars):", txt.substring(0,200));
    const cleaned = txt.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch(parseErr) {
      console.warn("❌ JSON parse failed:", parseErr.message);
      console.log("Full AI text length:", txt.length);
      return null;
    }

    console.log("📊 Parsed plan has", parsed?.meal_plan?.length, "days (wanted", totalDays + ")");
    // Lenient validation — accept partial responses if reasonable
    const minAcceptableDays = totalDays >= 7 ? Math.max(5, totalDays - 2) : Math.max(2, totalDays - 1);
    if (parsed && parsed.meal_plan && parsed.meal_plan.length >= minAcceptableDays) {
      console.log("🎉 AI plan SUCCESS! Got", parsed.meal_plan.length, "days (wanted", totalDays + ")");
      return parsed;
    }
    console.warn("⚠️ AI plan has fewer days than requested");
    return null;
  } catch(e) {
    if (e.name === "AbortError") {
      console.warn("⏱️ AI request timed out after 60 seconds — falling back");
    } else {
      console.warn("❌ AI gen failed with exception:", e.message, e);
    }
    return null;
  }
}

// ─── FALLBACK PLAN ───
function makeFallback(a, isPaid = false) {
  const diet = a.diet || "Lacto-Ovo Vegetarian";
  const cuisineArr = Array.isArray(a.cuisine) ? a.cuisine : (a.cuisine ? [a.cuisine] : []);
  const guj = cuisineArr.includes("Gujarati") || (a.focus||[]).includes("Authentic Gujarati Flavours");
  const veg = diet === "Vegan";
  const nv = diet === "Non-Vegetarian";
  const pesc = diet === "Pescatarian";
  const q = a.time === "15-20 min";

  // Diet-specific meal templates
  const templates = {
    "Non-Vegetarian": [
      [{time:"Breakfast",name:"Egg White Veggie Omelette",emoji:"🍳",cal:340,protein:"28g",carbs:"18g",fat:"16g",prep_time:"12 min",desc:"Fluffy egg whites with spinach, mushroom, and feta",ingredients:["4 egg whites + 1 whole egg","1/2 cup spinach","1/4 cup mushrooms","2 tbsp feta","Olive oil, salt, pepper"],instructions:["Whisk eggs with salt and pepper","Sauté spinach and mushrooms in olive oil","Pour eggs over veggies, cook until set","Fold omelette, top with feta"]},{time:"Lunch",name:"Grilled Chicken Quinoa Bowl",emoji:"🥗",cal:540,protein:"42g",carbs:"48g",fat:"16g",prep_time:q?"20 min":"30 min",desc:"Herb-marinated chicken over quinoa with roasted veggies",ingredients:["150g chicken breast","1 cup quinoa","1 cup roasted veggies","2 tbsp olive oil","Lemon, garlic, herbs"],instructions:["Marinate chicken in olive oil, lemon, garlic, herbs","Grill chicken 6-7 min each side","Cook quinoa per package","Assemble bowl with sliced chicken and veggies"]},{time:"Snack",name:"Greek Yogurt & Almonds",emoji:"🥄",cal:180,protein:"18g",carbs:"14g",fat:"6g",prep_time:"3 min",desc:"High-protein yogurt with crunchy almonds and honey",ingredients:["1 cup Greek yogurt","15 almonds","1 tsp honey"],instructions:["Scoop yogurt into bowl","Top with almonds and honey drizzle"]},{time:"Dinner",name:"Butter Chicken with Brown Rice",emoji:"🍛",cal:520,protein:"36g",carbs:"52g",fat:"18g",prep_time:q?"20 min":"40 min",desc:"Creamy tomato-based chicken curry with aromatic spices",ingredients:["200g chicken thigh, cubed","1 cup tomato puree","2 tbsp butter + cream","Garam masala, turmeric, chilli","Brown rice"],instructions:["Marinate chicken in yogurt and spices 10 min","Sauté ginger-garlic, add tomato puree and spices","Add chicken, cook until tender","Stir in butter and cream, serve over rice"]}],
      [{time:"Breakfast",name:"Turkey Sausage Breakfast Wrap",emoji:"🌯",cal:380,protein:"30g",carbs:"32g",fat:"14g",prep_time:"10 min",desc:"Whole wheat wrap with turkey sausage, scrambled eggs, avocado",ingredients:["2 turkey sausage links","2 eggs, scrambled","1 whole wheat wrap","1/4 avocado"],instructions:["Cook turkey sausage and slice","Scramble eggs lightly","Layer sausage, eggs, avocado in warm wrap","Roll up and serve"]},{time:"Lunch",name:"Chicken Tikka Salad",emoji:"🥗",cal:480,protein:"38g",carbs:"28g",fat:"22g",prep_time:"25 min",desc:"Spiced grilled chicken over greens with yogurt dressing",ingredients:["150g chicken breast","Tikka spice + yogurt marinade","Mixed greens, cucumber, tomato","Mint yogurt dressing"],instructions:["Marinate chicken in yogurt-tikka paste","Grill until charred and cooked through","Toss greens with veggies","Top with sliced chicken and dressing"]},{time:"Snack",name:"Protein Shake",emoji:"🥤",cal:200,protein:"24g",carbs:"22g",fat:"4g",prep_time:"3 min",desc:"Quick protein shake with banana and almond milk",ingredients:["1 scoop whey protein","1 banana","1 cup almond milk"],instructions:["Blend all ingredients until smooth","Pour and enjoy"]},{time:"Dinner",name:"Salmon Teriyaki with Stir-Fry",emoji:"🐟",cal:500,protein:"34g",carbs:"42g",fat:"20g",prep_time:q?"20 min":"30 min",desc:"Glazed salmon with colorful vegetable stir-fry",ingredients:["150g salmon fillet","2 tbsp teriyaki sauce","1 cup mixed stir-fry veggies","Brown rice","Sesame seeds"],instructions:["Brush salmon with teriyaki sauce","Pan-sear 4 min each side","Stir-fry vegetables in sesame oil","Serve salmon over rice with veggies"]}]
    ],
    "Pescatarian": [
      [{time:"Breakfast",name:"Smoked Salmon Avocado Toast",emoji:"🥑",cal:380,protein:"22g",carbs:"34g",fat:"18g",prep_time:"8 min",desc:"Whole grain toast with smoked salmon, avocado, capers",ingredients:["2 slices whole grain bread","60g smoked salmon","1/2 avocado","Capers, lemon, dill"],instructions:["Toast bread until golden","Mash avocado and spread on toast","Layer smoked salmon on top","Garnish with capers, dill, lemon"]},{time:"Lunch",name:"Shrimp Poke Bowl",emoji:"🍤",cal:520,protein:"32g",carbs:"56g",fat:"14g",prep_time:q?"15 min":"25 min",desc:"Marinated shrimp over sushi rice with edamame and avocado",ingredients:["150g cooked shrimp","1 cup sushi rice","1/2 avocado","Edamame, soy sauce, sesame"],instructions:["Cook sushi rice, season with rice vinegar","Toss shrimp with soy sauce and sesame oil","Assemble bowl with rice, shrimp, avocado, edamame","Top with nori and sesame seeds"]},{time:"Snack",name:"Cottage Cheese & Berries",emoji:"🫐",cal:170,protein:"16g",carbs:"18g",fat:"4g",prep_time:"3 min",desc:"High-protein cottage cheese topped with fresh berries",ingredients:["1 cup cottage cheese","1/2 cup mixed berries","1 tsp honey"],instructions:["Scoop cottage cheese into bowl","Top with berries and honey"]},{time:"Dinner",name:"Baked Cod with Roasted Veggies",emoji:"🐟",cal:460,protein:"36g",carbs:"38g",fat:"16g",prep_time:q?"20 min":"35 min",desc:"Herb-crusted cod with seasonal roasted vegetables",ingredients:["150g cod fillet","Mixed veggies (zucchini, peppers)","Olive oil, lemon, garlic","Sweet potato wedges"],instructions:["Season cod with olive oil, lemon, garlic, herbs","Toss veggies with olive oil, roast at 400°F 20 min","Add cod, bake 12-15 min more","Serve together with lemon squeeze"]}],
      [{time:"Breakfast",name:"Protein Smoothie Bowl",emoji:"🥣",cal:360,protein:"24g",carbs:"42g",fat:"12g",prep_time:"10 min",desc:"Thick berry smoothie with protein, granola, seeds",ingredients:["1 cup frozen berries","1 scoop protein powder","1/2 banana","Greek yogurt","Granola, coconut"],instructions:["Blend berries, protein, banana, yogurt until thick","Pour into bowl","Top with granola and coconut"]},{time:"Lunch",name:"Tuna Nicoise Salad",emoji:"🥗",cal:490,protein:"34g",carbs:"32g",fat:"22g",prep_time:"20 min",desc:"Classic French salad with tuna, eggs, olives, green beans",ingredients:["1 can tuna in olive oil","2 boiled eggs","Green beans, tomatoes, olives","Baby potatoes","Dijon vinaigrette"],instructions:["Boil eggs and potatoes, blanch green beans","Arrange greens on plate","Top with tuna, halved eggs, potatoes, beans","Drizzle with Dijon vinaigrette"]},{time:"Snack",name:"Trail Mix & Dark Chocolate",emoji:"🥜",cal:190,protein:"8g",carbs:"20g",fat:"10g",prep_time:"2 min",desc:"Almonds, walnuts, cranberries with dark chocolate",ingredients:["Mixed nuts","Dried cranberries","Dark chocolate chips"],instructions:["Mix ingredients together","Portion into small bowl"]},{time:"Dinner",name:"Garlic Butter Shrimp Pasta",emoji:"🍝",cal:520,protein:"30g",carbs:"56g",fat:"18g",prep_time:q?"18 min":"25 min",desc:"Sautéed shrimp in garlic butter over whole wheat pasta",ingredients:["150g shrimp","200g whole wheat pasta","3 cloves garlic, butter","Chilli flakes, parsley","Cherry tomatoes"],instructions:["Cook pasta al dente","Sauté garlic in butter, add chilli","Cook shrimp 2-3 min per side","Toss pasta with shrimp and tomatoes","Garnish with parsley"]}]
    ],
    "gujarati": [
      [{time:"Breakfast",name:"Moong Dal Chilla",emoji:"🥞",cal:360,protein:"22g",carbs:"38g",fat:"12g",prep_time:"15 min",desc:"Savory lentil crepes with mint-coriander chutney",ingredients:["1 cup moong dal (soaked)","Onion, green chillies","Coriander, turmeric, salt","Oil for cooking"],instructions:["Blend soaked dal with chillies into smooth batter","Add onions and coriander","Spread thin on hot tawa","Cook both sides until golden, serve with chutney"]},{time:"Lunch",name:"Gujarati Dal-Rice",emoji:"🍛",cal:520,protein:"26g",carbs:"62g",fat:"16g",prep_time:q?"20 min":"35 min",desc:"Sweet-tangy toor dal with rice, papad, and salad",ingredients:["1 cup toor dal","Jaggery, lemon juice","Mustard seeds, curry leaves","Rice, ghee"],instructions:["Pressure cook dal with turmeric and tomato","Add jaggery, lemon juice, salt","Prepare tadka with mustard seeds, cumin, curry leaves","Pour tadka into dal, simmer 5 min","Serve with rice and papad"]},{time:"Snack",name:"Dhokla with Chutney",emoji:"🟡",cal:180,protein:"14g",carbs:"22g",fat:"4g",prep_time:"15 min",desc:"Steamed chickpea flour cake with green chutney",ingredients:["1 cup besan","Yogurt, water, eno","Mustard seeds, curry leaves","Coriander, green chillies"],instructions:["Mix besan, yogurt, water, turmeric into batter","Add eno, pour into greased plate","Steam 12-15 minutes","Prepare tadka, pour over dhokla, cut and serve"]},{time:"Dinner",name:"Undhiyu with Bajra Rotla",emoji:"🥘",cal:480,protein:"24g",carbs:"48g",fat:"18g",prep_time:q?"25 min":"40 min",desc:"Traditional mixed vegetable casserole with millet flatbread",ingredients:["Purple yam, raw banana, brinjal","Green beans, papdi","Coconut-coriander-garlic masala","Bajra flour for rotla"],instructions:["Prepare masala paste with coconut, coriander, garlic","Layer veggies in pot with masala","Cook covered on low flame 30 min","Serve with fresh bajra rotla"]}],
      [{time:"Breakfast",name:"Thepla with Chai",emoji:"🫓",cal:340,protein:"18g",carbs:"44g",fat:"12g",prep_time:"15 min",desc:"Spiced fenugreek flatbread",ingredients:["Whole wheat flour","Fresh fenugreek leaves","Yogurt, turmeric, chilli","Ajwain seeds, oil"],instructions:["Mix fenugreek with flour and spices","Knead soft dough with yogurt","Roll thin, cook on tawa with oil","Serve warm with chai and pickle"]},{time:"Lunch",name:"Dal Dhokli",emoji:"🍲",cal:490,protein:"22g",carbs:"58g",fat:"14g",prep_time:"35 min",desc:"Wheat flour dumplings cooked in spiced dal",ingredients:["Toor dal, wheat flour","Peanuts, jaggery","Kokum or tamarind","Spices, curry leaves"],instructions:["Cook toor dal until soft","Make dough from wheat flour and spices","Roll and cut into diamond shapes","Add to boiling dal with jaggery and spices","Simmer until dhokli are cooked through"]},{time:"Snack",name:"Handvo",emoji:"🧁",cal:200,protein:"12g",carbs:"28g",fat:"6g",prep_time:"20 min",desc:"Savory mixed lentil and rice cake",ingredients:["Handvo batter (rice + lentil)","Bottle gourd, grated","Sesame seeds, mustard seeds","Green chilli, ginger"],instructions:["Mix batter with grated gourd and spices","Pour into greased pan","Top with sesame seeds","Bake or cook covered until golden","Cut into pieces and serve with chutney"]},{time:"Dinner",name:"Pav Bhaji",emoji:"🍞",cal:460,protein:"20g",carbs:"52g",fat:"16g",prep_time:"30 min",desc:"Spiced mashed vegetable curry with buttered pav",ingredients:["Mixed veggies (potato, cauliflower, peas)","Pav bhaji masala, butter","Onion, tomato, lemon","Pav buns"],instructions:["Boil and mash all vegetables","Sauté onions and tomatoes with masala","Add mashed veggies, butter, cook 10 min","Toast pav with butter","Serve garnished with onion and lemon"]}]
    ],
    "default": [
      [{time:"Breakfast",name:veg?"Protein Smoothie Bowl":"Protein Spinach Smoothie",emoji:"🥣",cal:360,protein:"22g",carbs:"38g",fat:"12g",prep_time:"10 min",desc:veg?"Thick berry smoothie with plant protein and granola":"Spinach, banana, protein powder, chia, almond butter",ingredients:veg?["Frozen berries","Plant protein powder","Banana, oat milk","Granola, coconut"]:["Spinach, banana","Protein powder, chia seeds","Almond butter, almond milk"],instructions:["Blend all base ingredients until smooth","Pour into bowl","Top with toppings and enjoy"]},{time:"Lunch",name:"Chickpea Buddha Bowl",emoji:"🥗",cal:520,protein:"26g",carbs:"62g",fat:"16g",prep_time:q?"18 min":"30 min",desc:"Roasted chickpeas, quinoa, veggies, tahini dressing",ingredients:["Chickpeas, quinoa","Mixed roasted veggies","Tahini, lemon juice","Mixed greens"],instructions:["Cook quinoa per package","Roast chickpeas with spices at 400°F 20 min","Arrange bowl with quinoa, chickpeas, veggies","Drizzle with tahini-lemon dressing"]},{time:"Snack",name:veg?"Trail Mix":"Cottage Cheese & Berries",emoji:veg?"🥜":"🫐",cal:180,protein:"14g",carbs:"20g",fat:"6g",prep_time:"3 min",desc:veg?"Mixed nuts, cranberries, dark chocolate":"Low-fat cottage cheese with berries and honey",ingredients:veg?["Mixed nuts","Dried cranberries","Dark chocolate chips"]:["Cottage cheese","Mixed berries","Honey"],instructions:veg?["Mix all ingredients","Portion into bowl"]:["Scoop cottage cheese","Top with berries and honey"]},{time:"Dinner",name:veg?"Tofu Stir-Fry":"Paneer Tikka Wrap",emoji:veg?"🥘":"🌯",cal:480,protein:"24g",carbs:"48g",fat:"18g",prep_time:q?"18 min":"35 min",desc:veg?"Crispy tofu with broccoli in soy ginger sauce":"Grilled paneer in wrap with mint raita",ingredients:veg?["Firm tofu, broccoli","Bell pepper, soy sauce","Ginger, brown rice"]:["Paneer, whole wheat wrap","Tikka marinade","Onion, pepper, mint raita"],instructions:veg?["Press and cube tofu, pan-fry golden","Stir-fry veggies on high heat","Add soy-ginger sauce, toss together","Serve over brown rice"]:["Marinate paneer in tikka spices 10 min","Grill until charred","Wrap with veggies and raita"]}],
      [{time:"Breakfast",name:"Overnight Protein Oats",emoji:"🫙",cal:340,protein:"18g",carbs:"44g",fat:"12g",prep_time:"5 min + overnight",desc:"Oats soaked with yogurt, chia, mango, almonds",ingredients:veg?["Oats, oat milk, chia","Mango, almonds","Plant milk"]:["Oats, Greek yogurt, chia","Mango, almonds","Milk"],instructions:["Combine oats, yogurt/milk, chia in jar","Refrigerate overnight","Top with mango and almonds"]},{time:"Lunch",name:veg?"Black Bean Burrito Bowl":"Palak Paneer with Roti",emoji:veg?"🌮":"🥬",cal:510,protein:"26g",carbs:"58g",fat:"16g",prep_time:q?"15 min":"30 min",desc:veg?"Black beans, rice, corn, salsa, guacamole":"Spinach paneer curry with whole wheat roti",ingredients:veg?["Black beans, rice","Corn, salsa, avocado","Lime, cilantro"]:["Paneer, spinach","Onion, garlic, cream","Garam masala, roti"],instructions:veg?["Cook rice, warm beans with cumin","Make guacamole with avocado and lime","Assemble bowl, top with cilantro"]:["Blanch and puree spinach","Sauté onion, garlic, spices","Add spinach, paneer, cream","Serve with warm roti"]},{time:"Snack",name:"Protein Energy Balls",emoji:"🟤",cal:200,protein:"14g",carbs:"22g",fat:"8g",prep_time:"10 min",desc:"Dates, oats, peanut butter, protein powder",ingredients:["Dates, oats","Peanut butter","Protein powder, honey"],instructions:["Blend dates and oats","Mix in peanut butter and protein","Roll into balls, refrigerate"]},{time:"Dinner",name:veg?"Lentil Coconut Curry":"Veggie Lentil Soup",emoji:"🍲",cal:460,protein:"22g",carbs:"52g",fat:"14g",prep_time:q?"20 min":"35 min",desc:veg?"Creamy coconut red lentil curry":"Red lentil soup with cumin and garlic bread",ingredients:veg?["Red lentils, coconut milk","Onion, garlic, ginger","Curry powder, rice"]:["Red lentils, carrots","Tomatoes, cumin, garlic","Whole wheat bread"],instructions:veg?["Sauté onion, garlic, ginger with curry","Add lentils and coconut milk, simmer 20 min","Serve over rice with cilantro"]:["Sauté onion, garlic, carrots","Add lentils, tomatoes, broth, cumin","Simmer 20 min, serve with bread"]}]
    ]
  };

  const key = nv ? "Non-Vegetarian" : pesc ? "Pescatarian" : guj ? "gujarati" : "default";
  const dayNames = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  const t = templates[key];

  // Generate 7 days for free, 28 days (4 weeks) for paid
  const totalDays = isPaid ? 28 : 7;
  const meal_plan = [];
  for(let i = 0; i < totalDays; i++) {
    const weekNum = Math.floor(i / 7) + 1;
    const dayInWeek = i % 7;
    meal_plan.push({
      day: dayNames[dayInWeek],
      week: weekNum,
      dayOfPlan: i + 1,
      meals: t[i % t.length].map(m => ({...m}))
    });
  }

  const workouts = {
    Beginner: [
      {day:"Monday",name:"Lower Body Basics",icon:"🦵",duration:"25 min",exercises:[{name:"Bodyweight Squats",detail:"3×12",modification:"Use a chair — sit back, then stand up. Hold a wall for balance if needed."},{name:"Lunges",detail:"3×10 each",modification:"Hold a wall or chair for balance. Reduce depth — only go as low as comfortable."},{name:"Glute Bridges",detail:"3×15",modification:"Keep your range smaller. Pause at the top instead of lifting higher."},{name:"Calf Raises",detail:"3×15",modification:"Hold a wall or counter for balance. Do single-leg only if pain-free."}]},
      {day:"Tuesday",name:"Upper Body + Core",icon:"💪",duration:"25 min",exercises:[{name:"Wall Push-ups",detail:"3×10",modification:"Stand farther from wall to make easier, closer to wall makes it harder."},{name:"Dumbbell Rows",detail:"3×10",modification:"Use lighter weights or water bottles. Keep back flat, no jerking."},{name:"Shoulder Press",detail:"3×10",modification:"Use lighter weights. Press only as high as feels comfortable for shoulders."},{name:"Plank Hold",detail:"3×30s",modification:"Drop to your knees instead of toes, OR do a wall plank standing up."}]},
      {day:"Wednesday",name:"Active Recovery",icon:"🧘",duration:"20 min",exercises:[{name:"Gentle Yoga Flow",detail:"15 min",modification:"Modify any pose that hurts. Use props if needed."},{name:"Foam Rolling",detail:"5 min",modification:"Apply less pressure. Skip painful areas — gentle is best."}]},
      {day:"Thursday",name:"Full Body Circuit",icon:"⚡",duration:"25 min",exercises:[{name:"Jumping Jacks",detail:"3×20",modification:"Step side-to-side instead of jumping (low-impact version)."},{name:"Squats",detail:"3×12",modification:"Sit back into a chair and stand up. Use chair arms for support if needed."},{name:"Push-ups",detail:"3×8",modification:"Do them on your knees, or against a wall. Lower to comfortable depth only."},{name:"Mountain Climbers",detail:"3×15",modification:"Slow them down or do them standing — bring knees to chest one at a time."}]},
      {day:"Friday",name:"Glutes & Legs",icon:"🍑",duration:"25 min",exercises:[{name:"Sumo Squats",detail:"3×15",modification:"Use a chair to sit back into. Reduce depth. Hold wall for balance."},{name:"Step-ups",detail:"3×10",modification:"Use a lower step or stair. Hold a wall or rail for balance."},{name:"Donkey Kicks",detail:"3×12 each",modification:"Stay on hands and knees. Don't kick too high — protect your lower back."},{name:"Hip Thrusts",detail:"3×15",modification:"Do them on the floor without weight, or use lighter weight."}]},
      {day:"Saturday",name:"Cardio + Core",icon:"🏃",duration:"25 min",exercises:[{name:"Brisk Walk",detail:"15 min",modification:"Slow your pace if needed. Even a gentle stroll counts."},{name:"Bicycle Crunches",detail:"3×15",modification:"Keep feet on floor and just twist torso. Skip if it causes back pain."},{name:"Leg Raises",detail:"3×10",modification:"Keep one foot on the floor and only lift one leg at a time."}]},
      {day:"Sunday",name:"Rest & Restore",icon:"😴",duration:"—",exercises:[{name:"Full rest day",detail:"",modification:"Reduce intensity — go slower, use less weight, or hold a wall for balance. Stop if anything hurts."},{name:"Stretching optional",detail:"",modification:"Hold each stretch 20-30 sec. Never stretch into pain."},{name:"Meal prep",detail:"",modification:"Reduce intensity — go slower, use less weight, or hold a wall for balance. Stop if anything hurts."}]},
    ],
    Intermediate: [
      {day:"Monday",name:"Lower Body Strength",icon:"🦵",duration:"35 min",exercises:[{name:"Goblet Squats",detail:"4×12",modification:"Use lighter weight or no weight. Sit back into a chair to limit depth."},{name:"Romanian Deadlifts",detail:"3×12",modification:"Use lighter weights. Bend knees more if hamstrings feel tight."},{name:"Walking Lunges",detail:"3×10 each",modification:"Do stationary lunges holding a wall for balance instead."},{name:"Hip Thrusts",detail:"4×15",modification:"Do them on the floor without weight, or use lighter weight."}]},
      {day:"Tuesday",name:"Upper Push/Pull",icon:"💪",duration:"30 min",exercises:[{name:"Push-ups",detail:"4×12",modification:"Do them on your knees, or against a wall. Lower to comfortable depth only."},{name:"Dumbbell Rows",detail:"4×12",modification:"Use lighter weights or water bottles. Keep back flat, no jerking."},{name:"Shoulder Press",detail:"3×10",modification:"Use lighter weights. Press only as high as feels comfortable for shoulders."},{name:"Plank",detail:"3×45s",modification:"Drop to your knees, or do a wall plank standing up."}]},
      {day:"Wednesday",name:"HIIT + Core",icon:"⚡",duration:"25 min",exercises:[{name:"Burpees",detail:"4×8",modification:"Do step-back burpees (no jump). Or replace with squat-to-stand only."},{name:"Mountain Climbers",detail:"4×20",modification:"Slow them down or do them standing — bring knees to chest one at a time."},{name:"Russian Twists",detail:"3×20",modification:"Keep feet on floor. Skip if it causes back pain."},{name:"Bicycle Crunches",detail:"3×20",modification:"Keep feet on floor and just twist torso. Skip if it causes back pain."}]},
      {day:"Thursday",name:"Active Recovery",icon:"🧘",duration:"25 min",exercises:[{name:"Yoga Flow",detail:"20 min",modification:"Skip any pose that causes pain. Use blocks or modify as needed."},{name:"Foam Rolling",detail:"5 min",modification:"Apply less pressure. Skip painful areas — gentle is best."}]},
      {day:"Friday",name:"Glute Focused",icon:"🍑",duration:"35 min",exercises:[{name:"Sumo Deadlifts",detail:"4×12",modification:"Use much lighter weight. Focus on form over weight."},{name:"Bulgarian Splits",detail:"3×10 each",modification:"Hold a wall for balance. Reduce depth significantly."},{name:"Cable Kickbacks",detail:"3×12",modification:"Use just bodyweight on hands and knees instead."},{name:"Leg Press",detail:"3×15",modification:"Reduce weight. Only push to comfortable knee bend (avoid deep angles)."}]},
      {day:"Saturday",name:"Cardio + Abs",icon:"🏃",duration:"30 min",exercises:[{name:"Incline Walk",detail:"20 min",modification:"Lower the incline or walk flat. Slow your pace if needed."},{name:"Hanging Leg Raises",detail:"3×12",modification:"Lie on floor and lift legs instead. Easier on shoulders and back."},{name:"Plank Variations",detail:"3×45s",modification:"Stick with knee plank or wall plank versions."}]},
      {day:"Sunday",name:"Rest Day",icon:"😴",duration:"—",exercises:[{name:"Complete rest",detail:"",modification:"Reduce intensity — go slower, use less weight, or hold a wall for balance. Stop if anything hurts."},{name:"Meal prep",detail:"",modification:"Reduce intensity — go slower, use less weight, or hold a wall for balance. Stop if anything hurts."}]},
    ],
    Advanced: [
      {day:"Monday",name:"Heavy Lower Body",icon:"🦵",duration:"45 min",exercises:[{name:"Barbell Squats",detail:"5×5",modification:"Use a much lighter weight or just dumbbells. Focus on form."},{name:"Romanian Deadlifts",detail:"4×10",modification:"Use lighter weights. Bend knees more if hamstrings feel tight."},{name:"Walking Lunges (weighted)",detail:"3×12 each",modification:"Do them without weight, holding a wall for balance."},{name:"Calf Raises",detail:"4×20",modification:"Hold a wall or counter for balance. Do single-leg only if pain-free."}]},
      {day:"Tuesday",name:"Upper Power",icon:"💪",duration:"40 min",exercises:[{name:"Bench Press",detail:"5×8",modification:"Use lighter dumbbells. Keep range of motion small if shoulders hurt."},{name:"Bent Over Rows",detail:"4×10",modification:"Use a bench for support. Use lighter weights."},{name:"OHP",detail:"4×8",modification:"Use much lighter weight. Press only to comfortable height."},{name:"Pull-ups",detail:"3×max",modification:"Use assisted pull-up machine, or do inverted rows from a low bar instead."}]},
      {day:"Wednesday",name:"HIIT Conditioning",icon:"⚡",duration:"30 min",exercises:[{name:"Box Jumps",detail:"4×10",modification:"Step up onto box instead of jumping. Use a lower box."},{name:"Burpees",detail:"4×12",modification:"Do step-back burpees (no jump). Or replace with squat-to-stand only."},{name:"Kettlebell Swings",detail:"4×15",modification:"Use a much lighter weight. Skip if back is sensitive."},{name:"Battle Ropes",detail:"4×30s",modification:"Reduce intensity — wave gently instead of slamming."}]},
      {day:"Thursday",name:"Active Recovery",icon:"🧘",duration:"30 min",exercises:[{name:"Yoga / Mobility",detail:"25 min",modification:"Reduce intensity — go slower, use less weight, or hold a wall for balance. Stop if anything hurts."},{name:"Foam Rolling",detail:"5 min",modification:"Apply less pressure. Skip painful areas — gentle is best."}]},
      {day:"Friday",name:"Glute Hypertrophy",icon:"🍑",duration:"40 min",exercises:[{name:"Hip Thrusts (heavy)",detail:"5×10",modification:"Use no weight or much lighter weight. Body weight only."},{name:"Sumo Squats",detail:"4×12",modification:"Use a chair to sit back into. Reduce depth. Hold wall for balance."},{name:"Single-Leg RDL",detail:"3×10 each",modification:"Hold a wall for balance. Don't go as deep."},{name:"Cable Kickbacks",detail:"3×15",modification:"Use just bodyweight on hands and knees instead."}]},
      {day:"Saturday",name:"Full Body + Cardio",icon:"🏃",duration:"40 min",exercises:[{name:"Deadlifts",detail:"4×6",modification:"Use much lighter weight. Or do Romanian deadlifts instead."},{name:"Push Press",detail:"4×8",modification:"Use lighter weight or just dumbbells. Press straight up only."},{name:"Farmer's Walk",detail:"3×40m",modification:"Use lighter weights. Walk shorter distance."},{name:"Stairmaster",detail:"15 min",modification:"Reduce speed. Hold rails for balance."}]},
      {day:"Sunday",name:"Rest & Recharge",icon:"😴",duration:"—",exercises:[{name:"Full rest",detail:"",modification:"Reduce intensity — go slower, use less weight, or hold a wall for balance. Stop if anything hurts."},{name:"Light walk optional",detail:"",modification:"Reduce intensity — go slower, use less weight, or hold a wall for balance. Stop if anything hurts."}]},
    ],
  };

  const groceryByDiet = {
    "Non-Vegetarian": [
      {category:"🥬 Fresh Produce",items:["Spinach (2 bunches)","Broccoli (2 heads)","Bell peppers (4)","Mushrooms (250g)","Tomatoes (6)","Onions (1 kg)","Avocados (3)","Bananas (6)","Lemons (4)","Mixed greens"]},
      {category:"🍗 Proteins",items:["Chicken breast (600g)","Chicken thighs (400g)","Turkey sausage (1 pack)","Salmon fillet (300g)","Eggs (12)","Greek yogurt (1 kg)","Whey protein"]},
      {category:"🌾 Grains",items:["Brown rice (1 kg)","Quinoa (500g)","Whole wheat wraps","Oats (500g)"]},
      {category:"🥜 Pantry",items:["Olive oil","Teriyaki sauce","Garam masala","Almond butter","Almonds","Honey","Butter, cream"]},
    ],
    "Pescatarian": [
      {category:"🥬 Fresh Produce",items:["Mixed greens (2 bags)","Cherry tomatoes","Avocados (4)","Zucchini (3)","Bell peppers (4)","Bananas (6)","Berries (2 packs)","Lemons (6)","Fresh dill, parsley"]},
      {category:"🐟 Seafood & Protein",items:["Salmon fillet (300g)","Cod fillet (300g)","Shrimp (400g)","Smoked salmon (150g)","Canned tuna (2)","Eggs (12)","Greek yogurt (1 kg)","Feta (200g)"]},
      {category:"🌾 Grains",items:["Quinoa (500g)","Sushi rice (500g)","Brown rice (1 kg)","Whole wheat pasta (500g)","Oats (500g)"]},
      {category:"🥜 Pantry",items:["Olive oil","Sesame oil","Soy sauce","Tahini","Hummus","Dijon mustard","Mixed nuts","Nori sheets","Edamame (frozen)"]},
    ],
    "default": [
      {category:"🥬 Fresh Produce",items:["Spinach (2 bunches)","Broccoli (2 heads)","Bell peppers (4)","Tomatoes (6)","Onions (4)","Bananas (6)","Berries (2 packs)","Lemons (4)","Mango (2)","Mixed greens"]},
      {category:"🫘 Proteins",items:[veg?"Firm tofu (800g)":"Paneer (400g)","Chickpeas (3 cans)","Red lentils (500g)",veg?"Plant yogurt":"Greek yogurt (1 kg)",veg?"":"Cottage cheese (500g)",veg?"":"Eggs (12)"].filter(Boolean)},
      {category:"🌾 Grains",items:["Quinoa (500g)","Brown rice (1 kg)","Oats (500g)","Whole wheat wraps","Whole wheat bread"]},
      {category:"🥜 Pantry",items:["Almond butter","Tahini","Chia seeds","Peanut butter","Protein powder","Dates (250g)","Honey","Soy sauce","Olive oil"]},
    ],
  };

  const gKey = nv?"Non-Vegetarian":pesc?"Pescatarian":"default";
  const grocery_list = guj ? [
    {category:"🥬 Produce",items:["Fenugreek leaves","Coriander","Green chillies","Ginger-garlic","Onions (1 kg)","Tomatoes (1 kg)","Potatoes","Mixed undhiyu veggies","Lemons (6)"]},
    {category:"🫘 Legumes",items:["Toor dal (500g)","Moong dal (500g)","Besan (500g)","Paneer (400g)","Yogurt (1 kg)","Ghee"]},
    {category:"🌾 Grains",items:["Wheat flour (1 kg)","Bajra flour (500g)","Rice (1 kg)","Pav buns","Makhana"]},
    {category:"🥜 Pantry",items:["Pav bhaji masala","Garam masala","Mustard seeds","Jaggery","Eno salt","Ajwain","Pickle"]},
  ] : groceryByDiet[gKey];

  // Generate workout plan — repeat the 7-day cycle for 28 days if paid
  const baseWorkouts = workouts[a.fitness] || workouts.Beginner;
  const workout_plan = [];
  for(let i = 0; i < totalDays; i++) {
    const weekNum = Math.floor(i / 7) + 1;
    const dayInWeek = i % 7;
    workout_plan.push({
      ...baseWorkouts[dayInWeek],
      week: weekNum,
      dayOfPlan: i + 1
    });
  }

  return { meal_plan, workout_plan, grocery_list };
}

// ─── DIET HELPERS ───
// diet is now an array like ["Lacto-Vegetarian", "Jain"]
// these helpers normalize for display, AI prompts, and DB storage
function dietToString(d) {
  if (!d) return "";
  if (Array.isArray(d)) return d.join(" + ");
  // Handle stringified arrays from older DB entries: '["Vegan"]' or "['vegan']"
  if (typeof d === "string" && (d.startsWith("[") || d.startsWith("'"))) {
    try {
      const parsed = JSON.parse(d.replace(/'/g, '"'));
      if (Array.isArray(parsed)) return parsed.join(" + ");
    } catch(e) {}
    // Fallback: strip brackets and quotes
    return d.replace(/[\[\]'"]/g, "").split(",").map(s => s.trim()).filter(Boolean).join(" + ");
  }
  return d;
}
function dietToArray(d) {
  if (!d) return [];
  if (Array.isArray(d)) return d;
  // Handle stringified arrays
  if (typeof d === "string" && (d.startsWith("[") || d.startsWith("'"))) {
    try {
      const parsed = JSON.parse(d.replace(/'/g, '"'));
      if (Array.isArray(parsed)) return parsed;
    } catch(e) {}
    return d.replace(/[\[\]'"]/g, "").split(",").map(s => s.trim()).filter(Boolean);
  }
  // Handle "Lacto-Vegetarian + Vegan" format
  if (typeof d === "string" && d.includes(" + ")) {
    return d.split(" + ").map(s => s.trim()).filter(Boolean);
  }
  return [d];
}
function dietHas(d, type) {
  return dietToArray(d).includes(type);
}

// ─── GROCERY MERGE ───
// Merge two grocery lists from different weeks, dedup items per category
function mergeGroceryLists(a, b) {
  const merged = {};
  [...(a || []), ...(b || [])].forEach(cat => {
    if (!cat?.category) return;
    if (!merged[cat.category]) merged[cat.category] = new Set();
    (cat.items || []).forEach(item => merged[cat.category].add(item));
  });
  return Object.entries(merged).map(([category, items]) => ({
    category,
    items: Array.from(items)
  }));
}

// ─── QUIZ DATA ───
const QUIZ = [
  {id:"goal",q:"What's your primary wellness goal?",sub:"We'll personalize everything around this",opts:[{l:"Lose Weight",e:"🔥",d:"Sustainable fat loss"},{l:"Build Strength",e:"💪",d:"Tone & define"},{l:"Balance Hormones",e:"🌸",d:"Cycle & cortisol support"},{l:"Improve Digestion",e:"🌿",d:"Gut health reset"}]},
  {id:"cuisine",q:"What cuisines do you love?",sub:"Pick up to 3 — we'll mix them into your meals",multi:true,maxSelect:3,opts:[
    {l:"Indian (North)",e:"🍛",d:"Punjabi, Mughlai"},
    {l:"Indian (South)",e:"🌶️",d:"Dosa, idli, sambar"},
    {l:"Gujarati",e:"🪔",d:"Dhokla, thepla, undhiyu"},
    {l:"Italian",e:"🍝",d:"Pasta, risotto"},
    {l:"Mexican",e:"🌮",d:"Tacos, bowls"},
    {l:"Chinese / Asian",e:"🥢",d:"Stir fry, noodles"},
    {l:"Mediterranean",e:"🥙",d:"Greek, Lebanese"},
    {l:"American",e:"🍔",d:"Comfort classics"},
    {l:"Thai / Vietnamese",e:"🍜",d:"Pho, curry"},
    {l:"Mixed Variety",e:"🌍",d:"Surprise me!"}
  ]},
  {id:"diet",q:"What's your dietary preference?",sub:"Select up to 3 — we'll respect them all",multi:true,maxSelect:3,opts:[
    {l:"Lacto-Vegetarian",e:"🥛",d:"Dairy, no eggs/meat",incompatible:["Vegan","Pescatarian","Non-Vegetarian","Pollotarian"]},
    {l:"Lacto-Ovo Vegetarian",e:"🧀",d:"Dairy & eggs, no meat",incompatible:["Vegan","Pescatarian","Non-Vegetarian","Pollotarian","Jain"]},
    {l:"Vegan",e:"🌱",d:"Fully plant-based",incompatible:["Lacto-Vegetarian","Lacto-Ovo Vegetarian","Pescatarian","Non-Vegetarian","Pollotarian","Eggetarian"]},
    {l:"Pescatarian",e:"🐟",d:"Vegetarian + seafood",incompatible:["Lacto-Vegetarian","Lacto-Ovo Vegetarian","Vegan","Non-Vegetarian","Jain","Pollotarian"]},
    {l:"Non-Vegetarian",e:"🍗",d:"Includes all proteins",incompatible:["Lacto-Vegetarian","Lacto-Ovo Vegetarian","Vegan","Pescatarian","Jain"]},
    {l:"Eggetarian",e:"🥚",d:"Vegetarian + eggs only",incompatible:["Vegan","Pescatarian","Non-Vegetarian","Pollotarian","Jain"]},
    {l:"Jain",e:"🙏",d:"No root veg, no eggs/meat",incompatible:["Vegan","Pescatarian","Non-Vegetarian","Pollotarian","Eggetarian","Lacto-Ovo Vegetarian"]},
    {l:"Pollotarian",e:"🍗",d:"Chicken only, no red meat",incompatible:["Lacto-Vegetarian","Lacto-Ovo Vegetarian","Vegan","Pescatarian","Eggetarian","Jain"]}
  ]},
  {id:"fitness",q:"What's your current fitness level?",sub:"No judgment — just finding your starting point",opts:[{l:"Beginner",e:"🌱",d:"Just getting started"},{l:"Intermediate",e:"⚡",d:"Somewhat active"},{l:"Advanced",e:"🏋️",d:"Regular training"}]},
  {id:"time",q:"How much time can you cook each day?",sub:"We'll match recipes to your schedule",opts:[{l:"15-20 min",e:"⏱️",d:"Quick & easy"},{l:"30-40 min",e:"🍳",d:"Moderate prep"},{l:"45-60 min",e:"👩‍🍳",d:"Love cooking!"}]},
  {id:"focus",q:"Any special focus areas?",sub:"Select all that apply",multi:true,opts:[{l:"High Protein",e:"💪"},{l:"Anti-Inflammatory",e:"🌿"},{l:"Low Carb",e:"🥗"},{l:"Iron-Rich",e:"🫘"},{l:"Gut-Friendly",e:"🦠"},{l:"Hormone Support",e:"🌸"}]},
];

const ETSY = [
  {id:1,name:"21-Day Cortisol Reset for Women",price:"$5.69",og:"$11.39",tags:["Balance Hormones","Hormone Support","Anti-Inflammatory"],url:"https://fitwithhiral.etsy.com/ca/listing/4488228680/21-day-cortisol-reset-for-women-reduce",e:"🧘"},
  {id:2,name:"Cycle Sync Wellness Plan",price:"$5.69",og:"$11.39",tags:["Balance Hormones","Hormone Support"],url:"https://fitwithhiral.etsy.com/ca/listing/4486631490/cycle-sync-wellness-plan-for-women",e:"🌸"},
  {id:3,name:"High Protein Vegetarian Fat Loss Plan",price:"$5.69",og:"$11.39",tags:["Lose Weight","High Protein","Build Strength"],url:"https://fitwithhiral.etsy.com/ca/listing/4486564199/high-protein-vegetarian-fat-loss-plan-28",e:"🥗"},
  {id:4,name:"14-Day Gut Health Reset for Women",price:"$5.69",og:"$11.39",tags:["Improve Digestion","Gut-Friendly","Anti-Inflammatory"],url:"https://fitwithhiral.etsy.com/ca/listing/4486013197/14-day-gut-health-reset-for-women",e:"🌿"},
];

// ─── UI HELPERS ───
const pf = "Playfair Display"; const dm = "DM Sans";
function Fi({children,delay=0,s}){const[v,setV]=useState(false);useEffect(()=>{const t=setTimeout(()=>setV(true),delay);return()=>clearTimeout(t)},[delay]); return <div style={{opacity:v?1:0,transform:v?"translateY(0)":"translateY(14px)",transition:"all 0.5s cubic-bezier(0.22,1,0.36,1)",...s}}>{children}</div>}
function Logo({s="md"}){const z=s==="sm"?16:s==="lg"?28:20; return <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:z,height:z,borderRadius:"50%",background:`linear-gradient(135deg,${C.coral},${C.peach})`,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{color:"#fff",fontSize:z*.5,fontWeight:700,fontFamily:pf}}>N</span></div><span style={{fontFamily:pf,fontSize:z*.85,fontWeight:600,color:C.dk,letterSpacing:"0.02em"}}>Nourish You</span></div>}
function Btn({children,onClick,disabled,full,secondary,style:sx}){ return <button onClick={onClick} disabled={disabled} style={{width:full?"100%":"auto",background:disabled?C.peachL:secondary?C.wh:`linear-gradient(135deg,${C.coral},${C.coralL})`,color:disabled?C.mtL:secondary?C.coral:"#fff",border:secondary?`2px solid ${C.coral}`:"none",borderRadius:50,padding:"15px 36px",fontFamily:dm,fontSize:16,fontWeight:600,cursor:disabled?"default":"pointer",transition:"all 0.3s",boxShadow:disabled||secondary?"none":`0 10px 30px ${C.coral}25`,letterSpacing:"0.02em",...sx}}>{children}</button>}

function getRelevantEtsy(a){ return ETSY.filter(p=>p.tags.some(t=>[a.goal,...(a.focus||[])].includes(t))); }

// ─── CONVERSION COMPONENTS ───
function CountdownTimer({planCreatedAt}) {
  const[time,setTime]=useState({d:0,h:0,m:0,s:0});
  useEffect(()=>{
    const calc=()=>{
      if(!planCreatedAt) return;
      const end = new Date(planCreatedAt).getTime() + FREE_ACCESS_DAYS*24*60*60*1000;
      const diff = Math.max(0, end - Date.now());
      setTime({d:Math.floor(diff/(86400000)),h:Math.floor((diff%86400000)/3600000),m:Math.floor((diff%3600000)/60000),s:Math.floor((diff%60000)/1000)});
    };
    calc();
    const iv=setInterval(calc,1000);
    return ()=>clearInterval(iv);
  },[planCreatedAt]);
  const isUrgent = time.d <= 1;
  return <div style={{background:isUrgent?`linear-gradient(135deg,${C.coral}15,${C.rose}10)`:`linear-gradient(135deg,${C.peachL},${C.bgW})`,borderRadius:14,padding:"12px 14px",border:`1px solid ${isUrgent?C.coral+"30":C.peachL}`,animation:isUrgent?"urgentPulse 2s ease infinite":"none"}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
      <div><span style={{fontFamily:dm,fontSize:11,fontWeight:600,color:isUrgent?C.coral:C.dk}}>{isUrgent?"⏰ Free access ending soon!":"⏳ Free access expires in"}</span></div>
      <div style={{display:"flex",gap:6}}>
        {[["d",time.d],["h",time.h],["m",time.m],["s",time.s]].map(([l,v])=> <div key={l} style={{textAlign:"center"}}>
          <div style={{background:isUrgent?C.coral:C.wh,borderRadius:6,padding:"4px 7px",minWidth:28,boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
            <span style={{fontFamily:dm,fontSize:14,fontWeight:700,color:isUrgent?"#fff":C.dk}}>{String(v).padStart(2,"0")}</span>
          </div>
          <span style={{fontFamily:dm,fontSize:7,color:C.mtL,textTransform:"uppercase"}}>{l}</span>
        </div>)}
      </div>
    </div>
  </div>;
}

function NudgeCard({daysPassed,onUpgrade}){
  if(daysPassed < 2) return null;
  const nudges = {
    2: {emoji:"💪",title:"You're doing amazing!",msg:"2 days in and crushing it. Keep the momentum going!",cta:null,bg:C.grL,border:C.gr},
    3: {emoji:"🌟",title:"Loving your plan?",msg:"Lock in your progress forever with the full 28-day program.",cta:"See Upgrade Options",bg:`${C.peach}12`,border:C.peach},
    4: {emoji:"📊",title:"Your Week 2-4 preview is ready",msg:"Based on your progress, we've mapped out your next 3 weeks. Don't miss out!",cta:"Unlock Full 28-Day Plan — $9.99 USD",bg:`${C.coral}08`,border:C.coral},
    5: {emoji:"⚡",title:"Only 2 days of free access left!",msg:"Your meal plans, recipes, and tracking data will be locked in 2 days. Upgrade to keep everything.",cta:"Upgrade Now — $9.99 USD",bg:`${C.coral}12`,border:C.coral},
    6: {emoji:"🚨",title:"Last day of free access!",msg:"Tomorrow your plan expires. Don't lose your saved meals, progress, and grocery lists.",cta:"Keep My Plan — $9.99 USD",bg:`${C.rose}12`,border:C.rose},
  };
  const n = nudges[Math.min(daysPassed,6)];
  if(!n) return null;
  return <div style={{background:n.bg,borderRadius:14,padding:14,border:`1px solid ${n.border}25`,marginBottom:10,animation:"slideUp 0.5s ease"}}>
    <div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
      <span style={{fontSize:22,animation:daysPassed>=5?"float 2s ease infinite":"none"}}>{n.emoji}</span>
      <div style={{flex:1}}>
        <div style={{fontFamily:dm,fontSize:13,fontWeight:600,color:C.dk}}>{n.title}</div>
        <div style={{fontFamily:dm,fontSize:11,color:C.mt,marginTop:2,lineHeight:1.4}}>{n.msg}</div>
        {n.cta && <button onClick={onUpgrade} style={{marginTop:8,background:`linear-gradient(135deg,${C.coral},${C.coralL})`,color:"#fff",border:"none",borderRadius:20,padding:"8px 16px",fontFamily:dm,fontSize:11,fontWeight:600,cursor:"pointer",animation:"glow 2s ease infinite"}}>{n.cta}</button>}
      </div>
    </div>
  </div>;
}

function SocialProof(){
  const[count,setCount]=useState(847);
  useEffect(()=>{
    const iv=setInterval(()=>{setCount(c=>c+Math.floor(Math.random()*3))},8000);
    return ()=>clearInterval(iv);
  },[]);
  return <div style={{display:"flex",alignItems:"center",gap:6,padding:"8px 12px",background:`${C.gr}10`,borderRadius:20,animation:"fadeScale 0.5s ease"}}>
    <div style={{display:"flex"}}>{["🧘","💪","🥗"].map((e,i)=> <span key={i} style={{fontSize:12,marginLeft:i>0?-4:0,animation:`float ${2+i*0.3}s ease infinite`,animationDelay:`${i*0.2}s`}}>{e}</span>)}</div>
    <span style={{fontFamily:dm,fontSize:10,color:C.gr,fontWeight:600}}>{count.toLocaleString()} people started this month</span>
  </div>;
}

// ─── DAILY MOTIVATION CARD ───
const MOTIVATIONS = [
  {quote:"You are one workout away from a better mood.",author:"— Daily Reminder",emoji:"💪",grad:[C.coral,C.peach]},
  {quote:"Small steps every day lead to big transformations.",author:"— Hiral",emoji:"🌱",grad:[C.gr,C.grL]},
  {quote:"Your body hears everything your mind says. Be kind.",author:"— Daily Reminder",emoji:"💕",grad:[C.rose,C.blush]},
  {quote:"Progress, not perfection, is the goal.",author:"— Hiral",emoji:"✨",grad:[C.gold,C.peachL]},
  {quote:"You don't have to be extreme. Just consistent.",author:"— Daily Reminder",emoji:"🔥",grad:[C.coral,C.gold]},
  {quote:"Nourish your body, honor your journey.",author:"— Hiral",emoji:"🌸",grad:[C.peach,C.rose]},
  {quote:"The only bad workout is the one you didn't do.",author:"— Daily Reminder",emoji:"⚡",grad:[C.coral,C.coralL]},
  {quote:"Wellness is a daily practice of self-love.",author:"— Hiral",emoji:"🌿",grad:[C.gr,C.peach]},
  {quote:"You are stronger than you think, braver than you believe.",author:"— Daily Reminder",emoji:"🦋",grad:[C.rose,C.peach]},
  {quote:"Every healthy choice is a vote for the person you're becoming.",author:"— Hiral",emoji:"🌟",grad:[C.gold,C.coral]},
  {quote:"Rest is productive too. Listen to your body.",author:"— Daily Reminder",emoji:"🧘",grad:[C.bl,C.grL]},
  {quote:"Hydrate, move, nourish, repeat.",author:"— Hiral",emoji:"💧",grad:[C.bl,C.peach]},
  {quote:"Discipline is choosing between what you want now and what you want most.",author:"— Daily Reminder",emoji:"🎯",grad:[C.coral,C.rose]},
  {quote:"Your future self will thank you for what you do today.",author:"— Hiral",emoji:"🌅",grad:[C.gold,C.peach]},
];

function DailyMotivation(){
  // Pick motivation based on day of year so it's consistent throughout the day
  const day = Math.floor(Date.now()/(86400000));
  const m = MOTIVATIONS[day % MOTIVATIONS.length];
  return <div style={{background:`linear-gradient(135deg,${m.grad[0]}15,${m.grad[1]}25)`,borderRadius:16,padding:16,border:`1px solid ${m.grad[0]}20`,position:"relative",overflow:"hidden",animation:"fadeScale 0.6s ease"}}>
    <div style={{position:"absolute",top:-20,right:-20,width:80,height:80,borderRadius:"50%",background:`${m.grad[0]}15`,animation:"float 5s ease infinite"}}/>
    <div style={{position:"absolute",bottom:-30,left:-15,width:60,height:60,borderRadius:"50%",background:`${m.grad[1]}25`,animation:"float 7s ease infinite",animationDelay:"1s"}}/>
    <div style={{position:"relative",zIndex:1}}>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
        <span style={{fontSize:20,animation:"float 3s ease infinite"}}>{m.emoji}</span>
        <span style={{fontFamily:dm,fontSize:9,fontWeight:700,color:m.grad[0],textTransform:"uppercase",letterSpacing:".1em"}}>Daily Motivation</span>
      </div>
      <p style={{fontFamily:pf,fontSize:15,fontWeight:500,color:C.dk,lineHeight:1.4,fontStyle:"italic"}}>"{m.quote}"</p>
      <p style={{fontFamily:dm,fontSize:10,color:C.mt,marginTop:6,fontWeight:500}}>{m.author}</p>
    </div>
  </div>;
}

// ─── SCREENS ───
function WelcomeScreen({onStart}){
  return <div style={{minHeight:"100vh",background:`linear-gradient(170deg,${C.bg} 0%,${C.bgW} 50%,${C.blush} 100%)`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,position:"relative",overflow:"hidden"}}>
    {/* Animated background circles */}
    <div style={{position:"absolute",top:-80,right:-80,width:240,height:240,borderRadius:"50%",background:C.peachL,opacity:.25,animation:"float 6s ease infinite"}}/>
    <div style={{position:"absolute",bottom:-50,left:-50,width:180,height:180,borderRadius:"50%",background:C.blush,opacity:.35,animation:"float 8s ease infinite",animationDelay:"1s"}}/>
    <div style={{position:"absolute",top:"45%",left:-20,width:80,height:80,borderRadius:"50%",border:`2px solid ${C.peachL}`,opacity:.2,animation:"float 5s ease infinite",animationDelay:"2s"}}/>
    <Fi delay={100}><div style={{width:80,height:80,borderRadius:"50%",background:`linear-gradient(135deg,${C.coral},${C.peach},${C.gold})`,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:12,boxShadow:`0 16px 50px ${C.coral}28`,animation:"float 3s ease infinite"}}><span style={{fontSize:36,color:"#fff",fontFamily:pf,fontWeight:700}}>N</span></div></Fi>
    <Fi delay={200}><h1 style={{fontFamily:pf,fontSize:36,fontWeight:700,color:C.dk,textAlign:"center",letterSpacing:"0.01em"}}>Nourish You</h1></Fi>
    <Fi delay={300}><p style={{fontFamily:dm,fontSize:12,fontWeight:500,color:C.coral,letterSpacing:"0.15em",textTransform:"uppercase",marginTop:4}}>by FitWithHiral</p></Fi>
    <Fi delay={450}><p style={{fontFamily:dm,fontSize:16,color:C.mt,textAlign:"center",maxWidth:330,lineHeight:1.6,marginTop:20}}>A personalized wellness experience with meal plans, workouts & progress tracking — built for <em style={{fontFamily:pf,color:C.coral}}>real life</em>.</p></Fi>
    <Fi delay={600}><div style={{marginTop:32,display:"flex",flexDirection:"column",alignItems:"center",gap:10}}><Btn onClick={onStart} style={{animation:"glow 2s ease infinite"}}>Take My Free Quiz →</Btn><span style={{fontFamily:dm,fontSize:12,color:C.mtL}}>2 minutes • Get your free 7-day plan</span></div></Fi>
    <Fi delay={700}><div style={{marginTop:16}}><SocialProof/></div></Fi>
    <Fi delay={800}><div style={{marginTop:24,display:"flex",gap:10,flexWrap:"wrap",justifyContent:"center"}}>{["🍽️ Customized Meals","🏋️ Smart Workouts","📊 Progress Tracking","🛒 Grocery Lists","🔄 Monthly Refreshes"].map((t,i)=><span key={i} style={{fontFamily:dm,fontSize:11,color:C.mt,background:`${C.wh}cc`,padding:"6px 12px",borderRadius:16,boxShadow:"0 1px 8px rgba(0,0,0,.03)",animation:`slideUp 0.4s ease`,animationDelay:`${0.8+i*0.1}s`,animationFillMode:"both"}}>{t}</span>)}</div></Fi>
  </div>;
}

function EmailScreen({onSubmit,onLogin}){
  const[name,setName]=useState("");const[email,setEmail]=useState("");const[loading,setLoading]=useState(false);const[err,setErr]=useState("");const[mode,setMode]=useState("signup");
  const go=async()=>{
    if(!email.trim()){setErr("Please enter your email");return}
    if(!/\S+@\S+\.\S+/.test(email)){setErr("Please enter a valid email");return}
    setLoading(true);setErr("");
    const normalizedEmail = email.trim().toLowerCase();

    if(mode==="login"){
      const ex=await sbFind("leads","email",normalizedEmail);
      setLoading(false);
      if(ex){onLogin(ex)}else{setErr("No account found. Try signing up!");setMode("signup")}
      return;
    }

    // Signup mode — first check if email already exists
    if(!name.trim()){setErr("Please enter your name");setLoading(false);return}

    const existing = await sbFind("leads", "email", normalizedEmail);
    if(existing){
      // Email already registered — auto-login them instead of creating duplicate
      setLoading(false);
      onLogin(existing);
      return;
    }

    // Email is new — create account
    let lid=null;
    try{const l=await sbInsert("leads",{name:name.trim(),email:normalizedEmail});lid=l?.id||null}catch(e){}

    // Subscribe to Mailchimp (fires welcome email automation)
    mailchimpSubscribe(normalizedEmail, name.trim()).catch(function(){}); // Don't await — runs in background

    setLoading(false);
    onSubmit({name:name.trim(),email:normalizedEmail,leadId:lid});
  };
  return <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",padding:24}}>
    <div style={{padding:"12px 0"}}><Logo s="sm"/></div>
    <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center",maxWidth:400}}>
      <Fi delay={80}><span style={{fontSize:36,marginBottom:12,display:"block"}}>{mode==="login"?"👋":"✉️"}</span>
        <h2 style={{fontFamily:pf,fontSize:26,fontWeight:600,color:C.dk,lineHeight:1.2}}>{mode==="login"?"Welcome back!":"Let's personalize\nyour plan"}</h2>
        <p style={{fontFamily:dm,fontSize:14,color:C.mtL,marginTop:6}}>{mode==="login"?"Log in to access your plan.":"Enter your details to get a meal + workout plan built just for you."}</p>
      </Fi>
      <Fi delay={200}>
        <div style={{marginTop:24,display:"flex",flexDirection:"column",gap:12}}>
          {mode==="signup"&&<div><label style={{fontFamily:dm,fontSize:12,fontWeight:600,color:C.mt,marginBottom:4,display:"block"}}>First Name</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Debbie" style={{width:"100%",padding:"13px 16px",borderRadius:12,border:`2px solid ${C.peachL}`,fontFamily:dm,fontSize:15,color:C.dk,background:C.wh}}/></div>}
          <div><label style={{fontFamily:dm,fontSize:12,fontWeight:600,color:C.mt,marginBottom:4,display:"block"}}>Email Address</label><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="debbie@gmail.com" type="email" style={{width:"100%",padding:"13px 16px",borderRadius:12,border:`2px solid ${C.peachL}`,fontFamily:dm,fontSize:15,color:C.dk,background:C.wh}} onKeyDown={e=>e.key==="Enter"&&go()}/></div>
          {err&&<p style={{fontFamily:dm,fontSize:12,color:C.rose}}>{err}</p>}
          <Btn full onClick={go} disabled={loading}>{loading?"Please wait...":mode==="login"?"Log In →":"Start My Quiz →"}</Btn>
          <p style={{fontFamily:dm,fontSize:12,color:C.mtL,textAlign:"center"}}>{mode==="signup"?<>Already have an account? <button onClick={()=>{setMode("login");setErr("")}} style={{background:"none",border:"none",color:C.coral,fontWeight:600,cursor:"pointer",fontFamily:dm,fontSize:12}}>Log in</button></>:<>New here? <button onClick={()=>{setMode("signup");setErr("")}} style={{background:"none",border:"none",color:C.coral,fontWeight:600,cursor:"pointer",fontFamily:dm,fontSize:12}}>Sign up free</button></>}</p>
          <p style={{fontFamily:dm,fontSize:10,color:C.mtL,textAlign:"center"}}>🔒 Your info is safe. No spam, ever.</p>
        </div>
      </Fi>
    </div>
  </div>;
}

function QuizScreen({step,answers,onAnswer,onBack,onNext}){
  const d=QUIZ[step];const sel=answers[d.id]||(d.multi?[]:null);
  const selArr = Array.isArray(sel) ? sel : [];

  // Build set of incompatible options based on current selections
  const incompatibleSet = new Set();
  if (d.multi) {
    selArr.forEach(selected => {
      const opt = d.opts.find(o => o.l === selected);
      if (opt?.incompatible) {
        opt.incompatible.forEach(i => incompatibleSet.add(i));
      }
    });
  }

  // Check if max select reached
  const maxReached = d.maxSelect && selArr.length >= d.maxSelect;

  const isOptDisabled = (l) => {
    if (!d.multi) return false;
    const isSelected = selArr.includes(l);
    if (isSelected) return false; // Allow deselect
    if (incompatibleSet.has(l)) return true; // Smart disable
    if (maxReached) return true; // Max reached
    return false;
  };

  const pick = l => {
    if (isOptDisabled(l)) return;
    if (d.multi) {
      const isSelected = selArr.includes(l);
      onAnswer(d.id, isSelected ? selArr.filter(x => x !== l) : [...selArr, l]);
    } else {
      onAnswer(d.id, l);
    }
  };
  const ok = d.multi ? selArr.length > 0 : !!sel;

  return <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column"}}>
    <div style={{padding:"16px 18px 12px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
      <button onClick={onBack} style={{background:"none",border:"none",fontFamily:dm,fontSize:13,color:C.mt,cursor:"pointer"}}>← Back</button>
      <Logo s="sm"/>
      <span style={{fontFamily:dm,fontSize:12,color:C.mtL}}>{step+1}/{QUIZ.length}</span>
    </div>
    <div style={{display:"flex",gap:4,padding:"0 18px"}}>{QUIZ.map((_,i)=><div key={i} style={{flex:1,height:4,borderRadius:2,background:i<=step?`linear-gradient(90deg,${C.coral},${C.peach})`:C.peachL,transition:"all .4s"}}/>)}</div>
    <div style={{padding:"26px 20px",flex:1}}>
      <Fi key={step} delay={30}>
        <h2 style={{fontFamily:pf,fontSize:24,fontWeight:600,color:C.dk,lineHeight:1.25}}>{d.q}</h2>
        <p style={{fontFamily:dm,fontSize:13,color:C.mtL,margin:"5px 0 22px"}}>{d.sub}{d.maxSelect && ` (${selArr.length}/${d.maxSelect})`}</p>
      </Fi>
      <div style={{display:"flex",flexDirection:"column",gap:9}}>
        {d.opts.map((o,i)=>{
          const on = d.multi ? selArr.includes(o.l) : sel === o.l;
          const disabled = isOptDisabled(o.l);
          return <Fi key={o.l} delay={60+i*40}><button onClick={()=>pick(o.l)} disabled={disabled} style={{width:"100%",background:C.wh,border:on?`2px solid ${C.coral}`:"2px solid transparent",borderRadius:13,padding:"15px 16px",display:"flex",alignItems:"center",gap:11,cursor:disabled?"not-allowed":"pointer",boxShadow:on?`0 5px 20px ${C.coral}14`:"0 1px 8px rgba(0,0,0,.03)",transition:"all .25s",textAlign:"left",opacity:disabled?0.4:1}}>
            <span style={{fontSize:24,width:36,textAlign:"center"}}>{o.e}</span>
            <div style={{flex:1}}>
              <div style={{fontFamily:dm,fontSize:14,fontWeight:600,color:C.dk}}>{o.l}</div>
              {o.d&&<div style={{fontFamily:dm,fontSize:11,color:C.mtL,marginTop:1}}>{o.d}</div>}
              {disabled && incompatibleSet.has(o.l) && <div style={{fontFamily:dm,fontSize:10,color:C.coral,marginTop:2,fontStyle:"italic"}}>Not compatible with your selection</div>}
            </div>
            {on&&<div style={{width:20,height:20,borderRadius:"50%",background:`linear-gradient(135deg,${C.coral},${C.peach})`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{color:"#fff",fontSize:12}}>✓</span></div>}
          </button></Fi>;
        })}
      </div>
    </div>
    {(d.multi||ok)&&<div style={{padding:"12px 20px 26px"}}><Btn full onClick={onNext} disabled={!ok}>{step===QUIZ.length-1?"Generate My Free Plan ✨":"Continue →"}</Btn></div>}
  </div>;
}

// Rotating fun facts / motivational cards shown during plan generation
const LOADING_CARDS = [
  // 🥑 Fun food facts
  {emoji:"🥑",category:"Did you know?",text:"Avocados contain MORE potassium than bananas — perfect for muscle recovery!"},
  {emoji:"🍯",category:"Did you know?",text:"Honey never spoils. Archaeologists found 3,000-year-old honey still safe to eat in Egyptian tombs!"},
  {emoji:"🥬",category:"Did you know?",text:"Spinach loses 50% of its nutrients within 5 days of refrigeration. Eat it fresh!"},
  {emoji:"🌶️",category:"Did you know?",text:"Capsaicin in chili peppers can boost your metabolism by up to 8% for hours after eating!"},
  {emoji:"🥚",category:"Did you know?",text:"Eggs contain ALL 9 essential amino acids — the gold standard of complete proteins."},
  {emoji:"🍓",category:"Did you know?",text:"Strawberries have more vitamin C than oranges, gram for gram!"},
  {emoji:"🌰",category:"Did you know?",text:"Almonds aren't actually nuts — they're seeds from the almond tree fruit!"},
  {emoji:"🥦",category:"Did you know?",text:"Broccoli contains more protein per calorie than steak. Plant power!"},
  {emoji:"🍌",category:"Did you know?",text:"Bananas are slightly radioactive (in a good way!) — they contain potassium-40."},
  {emoji:"🫐",category:"Did you know?",text:"Blueberries are one of the few foods that are truly naturally blue."},

  // 💪 Motivational
  {emoji:"💪",category:"Remember",text:"You're not just building a meal plan — you're investing in YOUR future self."},
  {emoji:"🌸",category:"Remember",text:"Small daily choices compound into massive transformations. You're already doing it."},
  {emoji:"✨",category:"Remember",text:"Progress, not perfection. Every healthy meal is a win worth celebrating."},
  {emoji:"🌿",category:"Remember",text:"Your body is the only place you'll ever truly live — make it a home you love."},
  {emoji:"🦋",category:"Remember",text:"Healing yourself is the most radical thing you can do. You're worth this time."},
  {emoji:"🌺",category:"Remember",text:"Strong is the new beautiful. And beautiful was always strong."},
  {emoji:"⭐",category:"Remember",text:"You don't have to be extreme. You just have to be consistent."},

  // 🧘 Wellness tips
  {emoji:"💧",category:"Wellness Tip",text:"Drink a glass of water before each meal — it aids digestion and reduces overeating!"},
  {emoji:"🌅",category:"Wellness Tip",text:"Morning sunlight (within 1 hour of waking) regulates your hormones for the entire day."},
  {emoji:"😴",category:"Wellness Tip",text:"Quality sleep burns calories too — your body repairs muscle and balances hormones overnight."},
  {emoji:"🚶‍♀️",category:"Wellness Tip",text:"A 10-minute walk after meals can reduce blood sugar spikes by up to 30%."},
  {emoji:"🧘‍♀️",category:"Wellness Tip",text:"Just 5 minutes of deep breathing daily can lower cortisol and reduce belly fat."},
  {emoji:"🍵",category:"Wellness Tip",text:"Green tea contains L-theanine — calm energy without the caffeine crash."},

  // 🤣 Light humor
  {emoji:"😄",category:"Fun Fact",text:"Carrots were originally PURPLE. The orange version was bred in the 17th century by the Dutch!"},
  {emoji:"🤣",category:"Smile Break",text:"Your future self is already thanking you for picking healthy options today."},
  {emoji:"🍕",category:"Smile Break",text:"Pizza is technically a salad if you put enough vegetables on it. (We don't actually believe this.)"},
  {emoji:"🥗",category:"Smile Break",text:"A salad a day keeps the cravings away. Maybe. Sometimes. Often!"},

  // 🎯 Stats/Science
  {emoji:"🔬",category:"Science Says",text:"Eating protein at every meal helps preserve lean muscle and keeps you fuller longer."},
  {emoji:"🌾",category:"Science Says",text:"Fiber feeds your gut bacteria — which influence your mood, immunity, and even cravings!"},
  {emoji:"🥄",category:"Science Says",text:"Eating slowly (20+ minutes per meal) helps your brain register fullness signals."},
  {emoji:"🍳",category:"Science Says",text:"Cooking at home cuts calorie intake by 25% on average vs eating out."},
];

function LoadingScreen({progress, isPaid}){
  const [cardIdx, setCardIdx] = useState(0);

  // Rotate cards every 5 seconds
  useEffect(() => {
    const iv = setInterval(() => {
      setCardIdx(i => (i + 1) % LOADING_CARDS.length);
    }, 5000);
    return () => clearInterval(iv);
  }, []);

  // Pick a random starting card so each generation feels fresh
  useEffect(() => {
    setCardIdx(Math.floor(Math.random() * LOADING_CARDS.length));
  }, []);

  const card = LOADING_CARDS[cardIdx];
  const timeEstimate = "4-5 minutes";

  return <div style={{minHeight:"100vh",background:`linear-gradient(170deg,${C.bg},${C.bgW})`,display:"flex",flexDirection:"column",alignItems:"center",padding:24,paddingTop:40}}>

    {/* Progress circle */}
    <div style={{width:110,height:110,borderRadius:"50%",background:`conic-gradient(${C.coral} ${progress*3.6}deg,${C.peachL} 0deg)`,display:"flex",alignItems:"center",justifyContent:"center",animation:"pulse 2s ease-in-out infinite",marginBottom:18}}>
      <div style={{width:90,height:90,borderRadius:"50%",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontFamily:pf,fontSize:24,fontWeight:700,color:C.coral}}>{Math.round(progress)}%</span></div>
    </div>

    <h2 style={{fontFamily:pf,fontSize:22,fontWeight:600,color:C.dk,textAlign:"center"}}>Creating Your {isPaid ? "28-Day" : "7-Day"} Plan</h2>
    <p style={{fontFamily:dm,fontSize:12,color:C.mtL,marginTop:3,textAlign:"center"}}>Personalizing based on your preferences</p>

    {/* Time estimate */}
    <div style={{marginTop:14,background:`${C.peachL}40`,borderRadius:20,padding:"5px 14px",display:"flex",alignItems:"center",gap:6}}>
      <span style={{fontSize:13}}>⏱️</span>
      <span style={{fontFamily:dm,fontSize:11,fontWeight:600,color:C.dk}}>Takes {timeEstimate}</span>
    </div>

    {/* Rotating fun fact card — the engagement star */}
    <div key={cardIdx} style={{marginTop:24,background:C.wh,borderRadius:18,padding:"22px 20px",width:"100%",maxWidth:340,boxShadow:`0 4px 24px ${C.coral}15`,border:`1px solid ${C.peachL}80`,animation:"fadeScale 0.5s cubic-bezier(0.22,1,0.36,1)",minHeight:160,display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center",justifyContent:"center"}}>
      <div style={{fontSize:42,marginBottom:8,animation:"slideUp 0.5s ease"}}>{card.emoji}</div>
      <div style={{fontFamily:dm,fontSize:10,fontWeight:700,color:C.coral,textTransform:"uppercase",letterSpacing:".1em",marginBottom:6}}>{card.category}</div>
      <p style={{fontFamily:dm,fontSize:13,color:C.dk,lineHeight:1.5,fontWeight:500,margin:0}}>{card.text}</p>
    </div>

    {/* Card indicators (dots) */}
    <div style={{display:"flex",gap:5,marginTop:14,justifyContent:"center"}}>
      {[0,1,2,3,4].map(i => {
        const isActive = (cardIdx % 5) === i;
        return <div key={i} style={{width:isActive?20:5,height:5,borderRadius:3,background:isActive?C.coral:C.peachL,transition:"all 0.4s ease"}}/>;
      })}
    </div>

    {/* Don't refresh notice */}
    <p style={{fontFamily:dm,fontSize:11,color:C.mtL,marginTop:18,textAlign:"center",maxWidth:320,lineHeight:1.5}}>
      ✨ Please don't close or refresh — your personalized plan is being crafted just for you!
    </p>

    {/* Reassurance footer */}
    <div style={{marginTop:14,display:"flex",alignItems:"center",gap:6,padding:"6px 14px",background:`${C.gr}10`,borderRadius:20}}>
      <span style={{fontSize:12}}>💚</span>
      <span style={{fontFamily:dm,fontSize:10,color:C.gr,fontWeight:600}}>Powered by AI • Made just for you</span>
    </div>
  </div>;
}

function PreviewScreen({plan,answers,user,isPaid,onUnlock}){
  const[exp,setExp]=useState(null);
  if(!plan?.meal_plan) return <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center"}}><p style={{fontFamily:dm}}>Loading...</p></div>;
  const day1=plan.meal_plan[0];
  const rel=getRelevantEtsy(answers);
  return <div style={{minHeight:"100vh",background:C.bg,paddingBottom:40}}>
    <div style={{padding:"16px 18px",display:"flex",justifyContent:"center"}}><Logo/></div>
    <div style={{padding:"0 20px"}}>
      <Fi delay={80}><div style={{textAlign:"center",marginBottom:18}}><span style={{fontSize:40}}>🎉</span><h2 style={{fontFamily:pf,fontSize:24,fontWeight:600,color:C.dk,marginTop:8}}>{user?.name?`${user.name}, your`:"Your"} {isPaid?"28-day premium":"free 7-day"} plan is ready!</h2><p style={{fontFamily:dm,fontSize:13,color:C.mt,marginTop:4}}>Here's a preview of Day 1</p></div></Fi>

      {/* Day 1 Preview */}
      <Fi delay={180}><div style={{background:C.wh,borderRadius:16,padding:16,boxShadow:"0 3px 16px rgba(0,0,0,.05)",marginBottom:14}}>
        <div style={{fontFamily:dm,fontSize:10,fontWeight:700,color:C.gr,textTransform:"uppercase",letterSpacing:".08em",marginBottom:10}}>✅ Day 1 — {day1.day}</div>
        {day1.meals?.map((m,i)=>{const k=`p-${i}`;const isE=exp===k; return <div key={i} style={{borderBottom:i<3?`1px solid ${C.bgW}`:"none"}}>
          <div onClick={()=>setExp(isE?null:k)} style={{padding:"10px 0",display:"flex",gap:9,alignItems:"center",cursor:"pointer"}}>
            <span style={{fontSize:20}}>{m.emoji}</span>
            <div style={{flex:1}}><div style={{fontFamily:dm,fontSize:13,fontWeight:600,color:C.dk}}>{m.name}</div><div style={{fontFamily:dm,fontSize:10,color:C.mtL}}>{m.cal} cal • {m.protein} protein • {m.prep_time}</div></div>
            <span style={{fontSize:10,color:C.mtL,transform:isE?"rotate(180deg)":"none",transition:"transform .2s"}}>▼</span>
          </div>
          {isE&&<div style={{padding:"0 0 10px 29px"}}>
            <p style={{fontFamily:dm,fontSize:11,color:C.mt,marginBottom:6}}>{m.desc}</p>
            <p style={{fontFamily:dm,fontSize:11,fontWeight:600,color:C.dk,marginBottom:3}}>Ingredients:</p>
            {(m.ingredients||[]).map((ing,j)=><div key={j} style={{fontFamily:dm,fontSize:11,color:C.mt,padding:"1px 0"}}><span style={{color:C.coral}}>•</span> {ing}</div>)}
            <p style={{fontFamily:dm,fontSize:11,fontWeight:600,color:C.dk,marginTop:6,marginBottom:3}}>Instructions:</p>
            {(m.instructions||[]).map((st,j)=><div key={j} style={{fontFamily:dm,fontSize:11,color:C.mt,padding:"1px 0"}}><span style={{fontWeight:700,color:C.coral}}>{j+1}.</span> {st}</div>)}
            <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>{[["Cal",m.cal],["Protein",m.protein],["Carbs",m.carbs],["Fat",m.fat]].map(([l,v],j)=><span key={j} style={{fontFamily:dm,fontSize:9,background:C.bgW,padding:"3px 8px",borderRadius:6,color:C.mt}}>{l}: <b>{v}</b></span>)}</div>
          </div>}
        </div>})}
      </div></Fi>

      {/* Open plan CTA */}
      <Fi delay={350}><div style={{background:`linear-gradient(135deg,${C.grL},${C.bgW})`,borderRadius:14,padding:16,marginBottom:16,textAlign:"center",border:`1px solid ${C.gr}30`}}>
        <span style={{fontSize:24}}>{isPaid?"⭐":"🎁"}</span>
        <h3 style={{fontFamily:pf,fontSize:17,fontWeight:600,color:C.dk,marginTop:4}}>{isPaid?"All 28 days included":"Days 2-7 included FREE"}</h3>
        <p style={{fontFamily:dm,fontSize:12,color:C.mt,marginTop:3}}>Full recipes, workouts, grocery list & tracking</p>
        <Btn onClick={onUnlock} style={{marginTop:12}}>{isPaid?"Open My 28-Day Plan →":"Open My Full 7-Day Plan →"}</Btn>
      </div></Fi>

      {/* 28-day upsell — only for free users — REDESIGNED FOR CONVERSION */}
      {!isPaid && <Fi delay={500}><div style={{background:`linear-gradient(165deg,${C.wh} 0%,${C.blush}80 100%)`,borderRadius:18,padding:0,border:`2px solid ${C.coral}30`,boxShadow:`0 8px 32px ${C.coral}18`,marginBottom:16,position:"relative",overflow:"hidden"}}>

        {/* Top gradient banner with badge */}
        <div style={{background:`linear-gradient(135deg,${C.coral},${C.peach})`,padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{fontFamily:dm,fontSize:9,fontWeight:700,color:"#fff",letterSpacing:".15em",textTransform:"uppercase"}}>⚡ Best Value · Most Popular</span>
          <span style={{background:"#fff",color:C.coral,fontFamily:dm,fontSize:9,fontWeight:700,padding:"3px 8px",borderRadius:10,letterSpacing:".05em"}}>SAVE 67%</span>
        </div>

        <div style={{padding:"18px 18px 16px"}}>
          {/* Hero Hook */}
          <div style={{textAlign:"center",marginBottom:14}}>
            <h3 style={{fontFamily:pf,fontSize:20,fontWeight:700,color:C.dk,lineHeight:1.25,marginBottom:4}}>Ready for real transformation?</h3>
            <p style={{fontFamily:dm,fontSize:12,color:C.mt,lineHeight:1.5}}>Your 7-day plan is just the start. Unlock the <b style={{color:C.coral}}>full 28-day journey</b> designed to create lasting change.</p>
          </div>

          {/* Visual comparison: Free vs Premium */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
            <div style={{background:`${C.bgW}`,borderRadius:10,padding:"10px 8px",textAlign:"center",opacity:0.75,border:`1px dashed ${C.peachL}`}}>
              <div style={{fontFamily:dm,fontSize:9,fontWeight:700,color:C.mtL,letterSpacing:".1em",textTransform:"uppercase",marginBottom:4}}>Free</div>
              <div style={{fontFamily:pf,fontSize:24,fontWeight:700,color:C.mtL,lineHeight:1}}>7</div>
              <div style={{fontFamily:dm,fontSize:9,color:C.mtL,marginTop:2}}>days</div>
              <div style={{fontFamily:dm,fontSize:9,color:C.mtL,marginTop:6}}>3 generations</div>
            </div>
            <div style={{background:`linear-gradient(135deg,${C.coral}15,${C.peach}25)`,borderRadius:10,padding:"10px 8px",textAlign:"center",border:`2px solid ${C.coral}40`,position:"relative"}}>
              <div style={{fontFamily:dm,fontSize:9,fontWeight:700,color:C.coral,letterSpacing:".1em",textTransform:"uppercase",marginBottom:4}}>⭐ Premium</div>
              <div style={{fontFamily:pf,fontSize:24,fontWeight:700,color:C.coral,lineHeight:1}}>28</div>
              <div style={{fontFamily:dm,fontSize:9,color:C.dk,marginTop:2,fontWeight:600}}>days</div>
              <div style={{fontFamily:dm,fontSize:9,color:C.coral,marginTop:6,fontWeight:600}}>10 generations</div>
            </div>
          </div>

          {/* Feature list with strong language */}
          <div style={{background:C.wh,borderRadius:12,padding:"12px 14px",marginBottom:14,boxShadow:"0 1px 6px rgba(0,0,0,.03)"}}>
            <div style={{fontFamily:dm,fontSize:10,fontWeight:700,color:C.coral,letterSpacing:".1em",textTransform:"uppercase",marginBottom:8}}>Everything you'll unlock</div>
            {[
              {e:"🗓️",t:"Full 4 weeks of unique meals",s:"Never repeat the same recipe twice"},
              {e:"💪",t:"Progressive workout program",s:"Builds strength week over week"},
              {e:"🛒",t:"Complete grocery lists",s:"Categorized & ready to shop"},
              {e:"🔄",t:"10 plan generations",s:"Experiment freely with new combos"},
              {e:"📄",t:"Beautiful downloadable PDF",s:"Print, save, take to the gym"},
              {e:"📊",t:"Saved plan history",s:"Switch between past plans anytime"}
            ].map((f,i)=><div key={i} style={{display:"flex",gap:8,padding:"5px 0",alignItems:"flex-start"}}>
              <span style={{fontSize:14,flexShrink:0,marginTop:1}}>{f.e}</span>
              <div style={{flex:1}}>
                <div style={{fontFamily:dm,fontSize:12,fontWeight:600,color:C.dk}}>{f.t}</div>
                <div style={{fontFamily:dm,fontSize:10,color:C.mtL,marginTop:1}}>{f.s}</div>
              </div>
              <span style={{color:C.gr,fontSize:13,flexShrink:0,marginTop:1}}>✓</span>
            </div>)}
          </div>

          {/* Pricing block — emphasize value */}
          <div style={{textAlign:"center",marginBottom:14}}>
            <div style={{display:"flex",alignItems:"baseline",justifyContent:"center",gap:8,marginBottom:2}}>
              <span style={{fontFamily:dm,fontSize:13,color:C.mtL,textDecoration:"line-through"}}>$29.99</span>
              <span style={{fontFamily:pf,fontSize:38,fontWeight:700,color:C.coral,lineHeight:1}}>$9.99</span>
              <span style={{fontFamily:dm,fontSize:11,color:C.mtL}}>USD</span>
            </div>
            <div style={{fontFamily:dm,fontSize:11,color:C.dk,fontWeight:600}}>One-time payment · No subscription · 28-day access</div>
            <div style={{fontFamily:dm,fontSize:10,color:C.gr,fontWeight:600,marginTop:4}}>That's just <b>36¢ per day</b> for full premium access</div>
          </div>

          {/* CTA */}
          <Btn full onClick={()=>window.open(STRIPE_LINK,"_blank")} style={{animation:"glow 2s ease infinite",fontSize:14,padding:"14px"}}>Unlock Premium — $9.99 →</Btn>

          {/* Trust signals */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:14,marginTop:12,flexWrap:"wrap"}}>
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <span style={{fontSize:11}}>🔒</span>
              <span style={{fontFamily:dm,fontSize:10,color:C.mtL,fontWeight:600}}>Secure Stripe</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <span style={{fontSize:11}}>⚡</span>
              <span style={{fontFamily:dm,fontSize:10,color:C.mtL,fontWeight:600}}>Instant access</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <span style={{fontSize:11}}>💳</span>
              <span style={{fontFamily:dm,fontSize:10,color:C.mtL,fontWeight:600}}>No subscription</span>
            </div>
          </div>

          <div style={{display:"flex",justifyContent:"center",marginTop:10}}><SocialProof/></div>

          {/* Soft urgency */}
          <p style={{fontFamily:dm,fontSize:10,color:C.coral,textAlign:"center",marginTop:8,fontWeight:600,fontStyle:"italic"}}>💛 Your future self will thank you for starting today</p>
        </div>
      </div></Fi>}

      {/* Etsy upsells */}
      {rel.length>0&&<Fi delay={650}><h3 style={{fontFamily:pf,fontSize:15,fontWeight:600,color:C.dk,marginBottom:8}}>Also recommended for you</h3>
        <div style={{display:"flex",gap:9,overflowX:"auto",paddingBottom:6}}>{rel.map(p=><a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none",flex:"0 0 auto",width:170,background:C.wh,borderRadius:12,padding:12,boxShadow:"0 1px 8px rgba(0,0,0,.03)"}}>
          <span style={{fontSize:24}}>{p.e}</span><div style={{fontFamily:dm,fontSize:12,fontWeight:600,color:C.dk,marginTop:4}}>{p.name}</div>
          <div style={{fontFamily:dm,fontSize:13,fontWeight:700,color:C.coral,marginTop:3}}>{p.price} <span style={{fontSize:10,color:C.mtL,textDecoration:"line-through",fontWeight:400}}>{p.og}</span></div>
          <div style={{fontFamily:dm,fontSize:9,color:C.gr,marginTop:2}}>50% OFF • PDF</div>
        </a>)}</div>
      </Fi>}
    </div>
  </div>;
}

function DashScreen({plan,answers,user,onRegen,onReset,isPaid,genCount,onUpgrade,planHistory,switchPlan,planCreatedAt,generateWeek,weekGenerating,deletePlan,onClearOldPlans,generatePDF}){
  const[tab,setTab]=useState("meals");const[day,setDay]=useState(0);const[exp,setExp]=useState(null);const[chk,setChk]=useState({});const[water,setWater]=useState(3);const[mood,setMood]=useState(null);const[btab,setBtab]=useState("home");const[libExp,setLibExp]=useState(null);const[week,setWeek]=useState(1);const[planSelOpen,setPlanSelOpen]=useState(false);const[currentPlanIdx,setCurrentPlanIdx]=useState(planHistory.length>0?planHistory.length-1:0);const[showAllPlans,setShowAllPlans]=useState(false);
  if(!plan?.meal_plan) return <div style={{padding:40,textAlign:"center",fontFamily:dm}}>Loading...</div>;
  const totalPlanDays = plan.meal_plan.length;
  // For paid users, always show 4 weeks (some may be locked/empty)
  const hasWeeks = isPaid;
  const totalWeeks = isPaid ? 4 : 1;
  const weekStart = (week - 1) * 7;
  const weekEnd = Math.min(weekStart + 7, totalPlanDays);
  const currentWeekMeals = plan.meal_plan.slice(weekStart, weekEnd);
  const currentWeekWorkouts = (plan.workout_plan || []).slice(weekStart, weekEnd);
  // Check if current week is "locked" (no data yet for paid users)
  const isCurrentWeekLocked = isPaid && currentWeekMeals.length === 0;
  // Check which weeks have data
  const weekHasData = (w) => plan.meal_plan.length >= (w * 7);
  const days = currentWeekMeals.map(d=>d.day?.slice(0,3));
  const meals = currentWeekMeals[day]?.meals || [];
  const tCal = meals.reduce((s,m)=>s+(m.cal||0),0);
  const done = meals.filter((_,i)=>chk[`${week}-${day}-${i}`]).length;
  const rel=getRelevantEtsy(answers);
  const daysPassed = planCreatedAt ? Math.floor((Date.now()-new Date(planCreatedAt).getTime())/(86400000)) : 0;

  return <div style={{minHeight:"100vh",background:C.bg,paddingBottom:76}}>
    {/* Header */}
    <div style={{background:C.wh,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:`1px solid ${C.peachL}`,position:"sticky",top:0,zIndex:10}}>
      <div onClick={()=>setBtab("home")} style={{cursor:"pointer"}}><Logo s="sm"/></div>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        {isPaid
          ? <span style={{background:`${C.coral}12`,borderRadius:14,padding:"3px 9px",fontFamily:dm,fontSize:9,fontWeight:600,color:C.coral,animation:"fadeScale 0.3s ease"}}>⭐ Premium • {planCreatedAt ? Math.max(0, PAID_ACCESS_DAYS - Math.floor((new Date()-new Date(planCreatedAt))/(1000*60*60*24))) : PAID_ACCESS_DAYS} days left</span>
          : <span style={{background:C.grL,borderRadius:14,padding:"3px 9px",fontFamily:dm,fontSize:9,fontWeight:600,color:C.gr}}>Free • {planCreatedAt ? Math.max(0, FREE_ACCESS_DAYS - Math.floor((new Date()-new Date(planCreatedAt))/(1000*60*60*24))) : FREE_ACCESS_DAYS} days left</span>
        }
        <div onClick={()=>setBtab("home")} style={{width:28,height:28,borderRadius:"50%",background:`linear-gradient(135deg,${C.coral},${C.peach})`,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontFamily:dm,fontSize:11,fontWeight:700,cursor:"pointer",boxShadow:btab==="home"?`0 0 0 2px ${C.wh},0 0 0 4px ${C.coral}`:"none",transition:"all 0.2s ease"}}>{user?.name?.[0]?.toUpperCase()||"U"}</div>
      </div>
    </div>

    {btab==="home"&&<div style={{padding:"14px 16px"}}>
      {/* Greeting */}
      <div style={{marginBottom:14}}>
        <h2 style={{fontFamily:pf,fontSize:22,fontWeight:600,color:C.dk,animation:"slideUp 0.4s ease"}}>Hey {user?.name||"there"}! 👋</h2>
        <p style={{fontFamily:dm,fontSize:13,color:C.mt,marginTop:2}}>{new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</p>
      </div>

      {/* Daily Motivation Card */}
      <div style={{marginBottom:14,animation:"slideUp 0.5s ease"}}><DailyMotivation/></div>

      {/* User Info Card */}
      <div style={{background:C.wh,borderRadius:16,padding:14,boxShadow:"0 1px 10px rgba(0,0,0,.04)",marginBottom:12,animation:"slideUp 0.6s ease"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
          <div style={{width:44,height:44,borderRadius:"50%",background:`linear-gradient(135deg,${C.coral},${C.peach})`,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontFamily:pf,fontSize:20,fontWeight:700}}>{user?.name?.[0]?.toUpperCase()||"U"}</div>
          <div style={{flex:1}}>
            <div style={{fontFamily:dm,fontSize:15,fontWeight:600,color:C.dk}}>{user?.name||"User"}</div>
            <div style={{fontFamily:dm,fontSize:11,color:C.mtL}}>{user?.email||""}</div>
          </div>
          {isPaid && <span style={{background:`linear-gradient(135deg,${C.coral},${C.peach})`,color:"#fff",fontFamily:dm,fontSize:9,fontWeight:700,padding:"4px 10px",borderRadius:12,letterSpacing:".04em"}}>⭐ PREMIUM</span>}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,paddingTop:10,borderTop:`1px solid ${C.bgW}`}}>
          <div><div style={{fontFamily:dm,fontSize:9,color:C.mtL,textTransform:"uppercase",letterSpacing:".04em"}}>Goal</div><div style={{fontFamily:dm,fontSize:12,fontWeight:600,color:C.dk,marginTop:2}}>{answers.goal||"—"}</div></div>
          <div><div style={{fontFamily:dm,fontSize:9,color:C.mtL,textTransform:"uppercase",letterSpacing:".04em"}}>Diet</div><div style={{fontFamily:dm,fontSize:12,fontWeight:600,color:C.dk,marginTop:2}}>{dietToString(answers.diet)||"—"}</div></div>
          <div><div style={{fontFamily:dm,fontSize:9,color:C.mtL,textTransform:"uppercase",letterSpacing:".04em"}}>Fitness</div><div style={{fontFamily:dm,fontSize:12,fontWeight:600,color:C.dk,marginTop:2}}>{answers.fitness||"—"}</div></div>
          <div><div style={{fontFamily:dm,fontSize:9,color:C.mtL,textTransform:"uppercase",letterSpacing:".04em"}}>Plan</div><div style={{fontFamily:dm,fontSize:12,fontWeight:600,color:isPaid?C.coral:C.gr,marginTop:2}}>{isPaid?"28-Day Premium":`${FREE_ACCESS_DAYS}-Day Free`}</div></div>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
        <button onClick={()=>setBtab("plan")} style={{background:C.wh,border:`1px solid ${C.peachL}`,borderRadius:12,padding:"12px 10px",cursor:"pointer",textAlign:"left",transition:"all 0.2s ease"}}>
          <span style={{fontSize:20}}>🥗</span>
          <div style={{fontFamily:dm,fontSize:12,fontWeight:600,color:C.dk,marginTop:4}}>View Plan</div>
          <div style={{fontFamily:dm,fontSize:9,color:C.mtL}}>Meals, workouts, grocery</div>
        </button>
        <button onClick={onRegen} style={{background:C.wh,border:`1px solid ${C.peachL}`,borderRadius:12,padding:"12px 10px",cursor:"pointer",textAlign:"left",transition:"all 0.2s ease"}}>
          <span style={{fontSize:20}}>🔄</span>
          <div style={{fontFamily:dm,fontSize:12,fontWeight:600,color:C.dk,marginTop:4}}>New Plan</div>
          <div style={{fontFamily:dm,fontSize:9,color:C.mtL}}>{isPaid?`${genCount}/${MAX_PAID_GENS} used`:`${genCount}/${MAX_FREE_GENS} used`}</div>
        </button>
      </div>

      {/* Saved Plans Section */}
      {planHistory.length > 0 && <div style={{background:C.wh,borderRadius:14,padding:14,marginBottom:12,boxShadow:"0 1px 8px rgba(0,0,0,.03)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <h3 style={{fontFamily:dm,fontSize:13,fontWeight:700,color:C.dk}}>📋 Your Saved Plans</h3>
          <span style={{fontFamily:dm,fontSize:10,color:C.mtL}}>{planHistory.length} saved</span>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {(() => {
            const reversed = [...planHistory].reverse();
            const visible = showAllPlans ? reversed : reversed.slice(0, 5);
            return visible.map((h, revIdx) => {
              const i = planHistory.length - 1 - revIdx;
              const isMostRecent = revIdx === 0;
              return <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:10,background:isMostRecent ? `${C.coral}08` : C.bgW,border:isMostRecent ? `1px solid ${C.coral}25` : "1px solid transparent"}}>
                <button onClick={()=>{switchPlan(i); setBtab("plan");}} style={{flex:1,background:"none",border:"none",cursor:"pointer",textAlign:"left",padding:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:18}}>{isMostRecent ? "⭐" : "📋"}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:dm,fontSize:12,fontWeight:600,color:C.dk}}>{isMostRecent ? "Most Recent" : `Plan ${i+1}`}</div>
                      <div style={{fontFamily:dm,fontSize:10,color:C.mtL,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{h.answers?.goal} · {dietToString(h.answers?.diet)}</div>
                    </div>
                  </div>
                </button>
                {!isMostRecent && <button onClick={()=>deletePlan(i)} style={{background:"none",border:"none",padding:"6px 8px",cursor:"pointer",borderRadius:6,opacity:0.5,transition:"opacity 0.2s"}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=0.5}>
                  <span style={{fontSize:14}}>🗑️</span>
                </button>}
              </div>;
            });
          })()}
        </div>
        {/* Show more / less toggle */}
        {planHistory.length > 5 && <button onClick={()=>setShowAllPlans(!showAllPlans)} style={{width:"100%",background:"none",border:"none",padding:"8px",marginTop:6,cursor:"pointer",fontFamily:dm,fontSize:11,fontWeight:600,color:C.coral}}>
          {showAllPlans ? `Show less ↑` : `Show all ${planHistory.length} plans ↓`}
        </button>}
        {/* Clear all older plans */}
        {planHistory.length > 1 && <button onClick={onClearOldPlans} style={{width:"100%",background:"none",border:`1px dashed ${C.peachL}`,borderRadius:8,padding:"6px 8px",marginTop:6,cursor:"pointer",fontFamily:dm,fontSize:10,fontWeight:600,color:C.mtL}}>
          🧹 Clear all {planHistory.length - 1} older plans
        </button>}
      </div>}

      {/* Upgrade CTA for free users — REDESIGNED FOR CONVERSION */}
      {!isPaid && <div style={{background:`linear-gradient(165deg,${C.wh} 0%,${C.blush}80 100%)`,borderRadius:18,padding:0,border:`2px solid ${C.coral}30`,boxShadow:`0 8px 32px ${C.coral}18`,marginBottom:12,position:"relative",overflow:"hidden"}}>

        {/* Top gradient banner with badge */}
        <div style={{background:`linear-gradient(135deg,${C.coral},${C.peach})`,padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{fontFamily:dm,fontSize:9,fontWeight:700,color:"#fff",letterSpacing:".15em",textTransform:"uppercase"}}>⚡ Best Value · Most Popular</span>
          <span style={{background:"#fff",color:C.coral,fontFamily:dm,fontSize:9,fontWeight:700,padding:"3px 8px",borderRadius:10,letterSpacing:".05em"}}>SAVE 67%</span>
        </div>

        <div style={{padding:"18px 18px 16px"}}>
          {/* Hero Hook */}
          <div style={{textAlign:"center",marginBottom:14}}>
            <h3 style={{fontFamily:pf,fontSize:20,fontWeight:700,color:C.dk,lineHeight:1.25,marginBottom:4}}>Ready for real transformation?</h3>
            <p style={{fontFamily:dm,fontSize:12,color:C.mt,lineHeight:1.5}}>Your 7-day plan is just the start. Unlock the <b style={{color:C.coral}}>full 28-day journey</b> designed to create lasting change.</p>
          </div>

          {/* Visual comparison: Free vs Premium */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
            <div style={{background:`${C.bgW}`,borderRadius:10,padding:"10px 8px",textAlign:"center",opacity:0.75,border:`1px dashed ${C.peachL}`}}>
              <div style={{fontFamily:dm,fontSize:9,fontWeight:700,color:C.mtL,letterSpacing:".1em",textTransform:"uppercase",marginBottom:4}}>Free</div>
              <div style={{fontFamily:pf,fontSize:24,fontWeight:700,color:C.mtL,lineHeight:1}}>7</div>
              <div style={{fontFamily:dm,fontSize:9,color:C.mtL,marginTop:2}}>days</div>
              <div style={{fontFamily:dm,fontSize:9,color:C.mtL,marginTop:6}}>3 generations</div>
            </div>
            <div style={{background:`linear-gradient(135deg,${C.coral}15,${C.peach}25)`,borderRadius:10,padding:"10px 8px",textAlign:"center",border:`2px solid ${C.coral}40`,position:"relative"}}>
              <div style={{fontFamily:dm,fontSize:9,fontWeight:700,color:C.coral,letterSpacing:".1em",textTransform:"uppercase",marginBottom:4}}>⭐ Premium</div>
              <div style={{fontFamily:pf,fontSize:24,fontWeight:700,color:C.coral,lineHeight:1}}>28</div>
              <div style={{fontFamily:dm,fontSize:9,color:C.dk,marginTop:2,fontWeight:600}}>days</div>
              <div style={{fontFamily:dm,fontSize:9,color:C.coral,marginTop:6,fontWeight:600}}>10 generations</div>
            </div>
          </div>

          {/* Feature list with strong language */}
          <div style={{background:C.wh,borderRadius:12,padding:"12px 14px",marginBottom:14,boxShadow:"0 1px 6px rgba(0,0,0,.03)"}}>
            <div style={{fontFamily:dm,fontSize:10,fontWeight:700,color:C.coral,letterSpacing:".1em",textTransform:"uppercase",marginBottom:8}}>Everything you'll unlock</div>
            {[
              {e:"🗓️",t:"Full 4 weeks of unique meals",s:"Never repeat the same recipe twice"},
              {e:"💪",t:"Progressive workout program",s:"Builds strength week over week"},
              {e:"🛒",t:"Complete grocery lists",s:"Categorized & ready to shop"},
              {e:"🔄",t:"10 plan generations",s:"Experiment freely with new combos"},
              {e:"📄",t:"Beautiful downloadable PDF",s:"Print, save, take to the gym"},
              {e:"📊",t:"Saved plan history",s:"Switch between past plans anytime"}
            ].map((f,i)=><div key={i} style={{display:"flex",gap:8,padding:"5px 0",alignItems:"flex-start"}}>
              <span style={{fontSize:14,flexShrink:0,marginTop:1}}>{f.e}</span>
              <div style={{flex:1}}>
                <div style={{fontFamily:dm,fontSize:12,fontWeight:600,color:C.dk}}>{f.t}</div>
                <div style={{fontFamily:dm,fontSize:10,color:C.mtL,marginTop:1}}>{f.s}</div>
              </div>
              <span style={{color:C.gr,fontSize:13,flexShrink:0,marginTop:1}}>✓</span>
            </div>)}
          </div>

          {/* Pricing block — emphasize value */}
          <div style={{textAlign:"center",marginBottom:14}}>
            <div style={{display:"flex",alignItems:"baseline",justifyContent:"center",gap:8,marginBottom:2}}>
              <span style={{fontFamily:dm,fontSize:13,color:C.mtL,textDecoration:"line-through"}}>$29.99</span>
              <span style={{fontFamily:pf,fontSize:38,fontWeight:700,color:C.coral,lineHeight:1}}>$9.99</span>
              <span style={{fontFamily:dm,fontSize:11,color:C.mtL}}>USD</span>
            </div>
            <div style={{fontFamily:dm,fontSize:11,color:C.dk,fontWeight:600}}>One-time payment · No subscription · 28-day access</div>
            <div style={{fontFamily:dm,fontSize:10,color:C.gr,fontWeight:600,marginTop:4}}>That's just <b>36¢ per day</b> for full premium access</div>
          </div>

          {/* CTA */}
          <button onClick={onUpgrade} style={{width:"100%",background:`linear-gradient(135deg,${C.coral},${C.coralL})`,color:"#fff",border:"none",borderRadius:30,padding:"14px",fontFamily:dm,fontSize:14,fontWeight:600,cursor:"pointer",animation:"glow 2s ease infinite",boxShadow:`0 6px 20px ${C.coral}40`}}>Unlock Premium — $9.99 →</button>

          {/* Trust signals */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:14,marginTop:12,flexWrap:"wrap"}}>
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <span style={{fontSize:11}}>🔒</span>
              <span style={{fontFamily:dm,fontSize:10,color:C.mtL,fontWeight:600}}>Secure Stripe</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <span style={{fontSize:11}}>⚡</span>
              <span style={{fontFamily:dm,fontSize:10,color:C.mtL,fontWeight:600}}>Instant access</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <span style={{fontSize:11}}>💳</span>
              <span style={{fontFamily:dm,fontSize:10,color:C.mtL,fontWeight:600}}>No subscription</span>
            </div>
          </div>

          <div style={{display:"flex",justifyContent:"center",marginTop:10}}><SocialProof/></div>

          {/* Soft urgency */}
          <p style={{fontFamily:dm,fontSize:10,color:C.coral,textAlign:"center",marginTop:8,fontWeight:600,fontStyle:"italic"}}>💛 Your future self will thank you for starting today</p>
        </div>
      </div>}

      {/* Countdown for free users */}
      {!isPaid && <div style={{marginBottom:10}}><CountdownTimer planCreatedAt={planCreatedAt}/></div>}
    </div>}

    {btab==="plan"&&<>
      <div style={{padding:"12px 16px 2px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
          <div style={{flex:1,minWidth:0}}>
            <h2 style={{fontFamily:pf,fontSize:20,fontWeight:600,color:C.dk,animation:"slideUp 0.4s ease"}}>Your Plan</h2>
            <p style={{fontFamily:dm,fontSize:12,color:C.mt,marginTop:1}}>Your {dietToString(answers.diet)} plan for <b>{answers.goal}</b></p>
          </div>
          {isPaid && <button onClick={generatePDF} style={{background:`linear-gradient(135deg,${C.coral},${C.peach})`,border:"none",borderRadius:10,padding:"7px 11px",cursor:"pointer",display:"flex",alignItems:"center",gap:4,fontFamily:dm,fontSize:11,fontWeight:600,color:"#fff",whiteSpace:"nowrap",boxShadow:`0 2px 8px ${C.coral}30`}}>
            📄 PDF
          </button>}
          {planHistory.length > 1 && <button onClick={()=>setPlanSelOpen(!planSelOpen)} style={{background:C.wh,border:`1px solid ${C.peachL}`,borderRadius:10,padding:"7px 11px",cursor:"pointer",display:"flex",alignItems:"center",gap:4,fontFamily:dm,fontSize:11,fontWeight:600,color:C.dk,whiteSpace:"nowrap"}}>
            📋 {planHistory.length} Saved
            <span style={{fontSize:9,marginLeft:2,transform:planSelOpen?"rotate(180deg)":"none",transition:"transform 0.2s"}}>▾</span>
          </button>}
        </div>

        {/* Saved Plans Dropdown */}
        {planSelOpen && planHistory.length > 1 && <div style={{background:C.wh,borderRadius:12,padding:8,marginTop:10,boxShadow:"0 4px 20px rgba(0,0,0,.08)",animation:"slideUp 0.3s ease",border:`1px solid ${C.peachL}`}}>
          <div style={{fontFamily:dm,fontSize:9,fontWeight:700,color:C.mtL,textTransform:"uppercase",letterSpacing:".05em",padding:"4px 8px"}}>Switch Plan</div>
          {planHistory.map((h,i)=>{
            const isActive = i === currentPlanIdx;
            return <button key={i} onClick={()=>{switchPlan(i);setCurrentPlanIdx(i);setPlanSelOpen(false);setDay(0);setWeek(1);setExp(null)}} style={{width:"100%",background:isActive?`${C.coral}10`:"transparent",border:"none",borderRadius:8,padding:"9px 10px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:8,marginTop:i>0?2:0}}>
              <div style={{width:30,height:30,borderRadius:8,background:isActive?C.coral:C.peachL,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <span style={{fontSize:14}}>{i === planHistory.length - 1 ? "⭐" : "📋"}</span>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:dm,fontSize:12,fontWeight:600,color:C.dk}}>{i === planHistory.length - 1 ? "Most Recent" : `Plan ${i+1}`}</div>
                <div style={{fontFamily:dm,fontSize:10,color:C.mtL,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{h.label || `${h.answers?.goal || "Plan"} (${h.answers?.diet || ""})`}</div>
              </div>
              {isActive && <span style={{fontSize:11,color:C.coral,fontWeight:700}}>✓</span>}
            </button>;
          })}
        </div>}
      </div>

      {/* Stats with animation */}
      <div style={{display:"flex",gap:7,padding:"9px 16px",overflowX:"auto"}}>{[{l:"Calories",v:tCal,u:"kcal",c:C.coral},{l:"Meals",v:`${done}/4`,c:C.gr},{l:"Water",v:`${water}/8`,u:"cups",c:C.bl}].map((s,i)=><div key={i} style={{flex:"0 0 auto",minWidth:105,background:C.wh,borderRadius:12,padding:"11px 13px",boxShadow:"0 1px 8px rgba(0,0,0,.03)",animation:`slideUp 0.4s ease`,animationDelay:`${i*0.1}s`,animationFillMode:"both"}}><div style={{fontFamily:dm,fontSize:9,color:C.mtL,textTransform:"uppercase",letterSpacing:".05em"}}>{s.l}</div><span style={{fontFamily:pf,fontSize:22,fontWeight:700,color:s.c}}>{s.v}</span>{s.u&&<span style={{fontFamily:dm,fontSize:10,color:C.mtL,marginLeft:2}}>{s.u}</span>}</div>)}</div>

      {/* Day-based nudge card — only for free users */}
      {!isPaid && <div style={{padding:"0 16px"}}><NudgeCard daysPassed={daysPassed} onUpgrade={onUpgrade}/></div>}

      {/* Water */}
      <div style={{padding:"2px 16px 6px",display:"flex",alignItems:"center",gap:5}}><span style={{fontSize:11}}>💧</span>{Array.from({length:8}).map((_,i)=><button key={i} onClick={()=>setWater(i+1)} style={{width:23,height:23,borderRadius:6,border:"none",background:i<water?C.bl:C.peachL,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s ease"}}><span style={{fontSize:9,opacity:i<water?1:.3}}>💧</span></button>)}</div>

      {/* Tabs */}
      <div style={{display:"flex",padding:"0 16px",borderBottom:`1px solid ${C.peachL}`}}>{[["meals","🥗 Meals"],["workout","🏋️ Workout"],["grocery","🛒 Grocery"]].map(([id,lbl])=><button key={id} onClick={()=>setTab(id)} style={{background:"none",border:"none",borderBottom:tab===id?`3px solid ${C.coral}`:"3px solid transparent",padding:"9px 13px",fontFamily:dm,fontSize:13,fontWeight:tab===id?600:400,color:tab===id?C.coral:C.mtL,cursor:"pointer"}}>{lbl}</button>)}</div>

      <div style={{padding:"12px 16px"}}>
        {tab==="meals"&&<>
          {/* Week selector — for paid users */}
          {hasWeeks && <div style={{display:"flex",gap:6,marginBottom:10,padding:"4px",background:C.bgW,borderRadius:12}}>
            {[1,2,3,4].map(w => {
              const has = weekHasData(w);
              return <button key={w} onClick={()=>{setWeek(w);setDay(0);setExp(null)}} style={{flex:1,background:week===w?C.wh:"transparent",border:"none",borderRadius:9,padding:"8px 4px",cursor:"pointer",boxShadow:week===w?`0 2px 8px ${C.coral}20`:"none",transition:"all 0.2s ease",position:"relative"}}>
                <div style={{fontFamily:dm,fontSize:9,fontWeight:600,color:week===w?C.coral:C.mtL,textTransform:"uppercase",letterSpacing:".05em"}}>Week</div>
                <div style={{fontFamily:pf,fontSize:16,fontWeight:700,color:week===w?C.dk:C.mtL,marginTop:-2}}>{w}{!has && <span style={{fontSize:11,marginLeft:2}}>🔒</span>}</div>
              </button>;
            })}
          </div>}

          {/* Locked week — show generate CTA */}
          {isCurrentWeekLocked && <div style={{background:`linear-gradient(135deg,${C.peachL}40,${C.blush}60)`,borderRadius:16,padding:24,marginTop:16,textAlign:"center",border:`1px solid ${C.coral}25`,animation:"fadeScale 0.4s ease"}}>
            <span style={{fontSize:36}}>🔒</span>
            <h3 style={{fontFamily:pf,fontSize:18,fontWeight:600,color:C.dk,marginTop:8}}>Week {week} is locked</h3>
            <p style={{fontFamily:dm,fontSize:13,color:C.mt,marginTop:4,lineHeight:1.5,maxWidth:280,marginLeft:"auto",marginRight:"auto"}}>Generate Week {week} on-demand. Takes about 4-5 minutes and includes 7 unique meals + workouts.</p>
            <Btn onClick={()=>generateWeek(week)} style={{marginTop:14,opacity:weekGenerating?0.6:1,cursor:weekGenerating?"not-allowed":"pointer"}} disabled={!!weekGenerating}>
              {weekGenerating === week ? "Generating..." : weekGenerating ? "Please wait..." : `Generate Week ${week} →`}
            </Btn>
            {weekGenerating === week && <p style={{fontFamily:dm,fontSize:11,color:C.mtL,marginTop:10}}>⏱️ Working on it... please don't refresh</p>}
          </div>}

          {!isCurrentWeekLocked && <>
          <div style={{display:"flex",gap:4,marginBottom:10,overflowX:"auto"}}>{days.map((d,i)=><button key={i} onClick={()=>{setDay(i);setExp(null)}} style={{flex:"0 0 auto",width:38,height:46,borderRadius:11,border:"none",background:day===i?C.coral:C.wh,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1,boxShadow:day===i?`0 3px 10px ${C.coral}28`:"0 1px 4px rgba(0,0,0,.03)"}}><span style={{fontFamily:dm,fontSize:8,fontWeight:600,color:day===i?"#fff":C.mtL}}>{d}</span><span style={{fontFamily:dm,fontSize:11,fontWeight:700,color:day===i?"#fff":C.dk}}>{i+1}</span></button>)}</div>

          {meals.map((m,i)=>{const k=`${week}-${day}-${i}`;const isE=exp===k;const isDone=chk[k]; return <div key={k} style={{background:C.wh,borderRadius:13,marginBottom:7,overflow:"hidden",opacity:(isDone&&!isE)?0.5:1,boxShadow:"0 1px 8px rgba(0,0,0,.03)",transition:"opacity .3s"}}>
            <div onClick={()=>setExp(isE?null:k)} style={{padding:13,cursor:"pointer",display:"flex",justifyContent:"space-between"}}>
              <div style={{flex:1}}><div style={{fontFamily:dm,fontSize:9,color:C.coral,fontWeight:600,textTransform:"uppercase",letterSpacing:".05em"}}>{m.time}</div><div style={{fontFamily:dm,fontSize:14,fontWeight:600,color:C.dk,marginTop:2}}>{m.emoji} {m.name}</div><div style={{fontFamily:dm,fontSize:11,color:C.mtL,marginTop:2}}>{m.desc}</div>
                <div style={{display:"flex",gap:5,marginTop:5,flexWrap:"wrap"}}><span style={{fontFamily:dm,fontSize:9,color:C.mt,background:C.bgW,padding:"2px 7px",borderRadius:7}}>{m.cal} cal</span><span style={{fontFamily:dm,fontSize:9,color:C.gr,background:C.grL,padding:"2px 7px",borderRadius:7}}>{m.protein} protein</span><span style={{fontFamily:dm,fontSize:9,color:C.bl,background:`${C.bl}10`,padding:"2px 7px",borderRadius:7}}>⏱ {m.prep_time}</span></div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5,flexShrink:0,marginLeft:5}}>
                <button onClick={e=>{e.stopPropagation();setChk(p=>({...p,[k]:!p[k]}))}} style={{width:26,height:26,borderRadius:7,border:isDone?"none":`2px solid ${C.peachL}`,background:isDone?C.gr:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.3s ease",animation:isDone?"tickPulse 0.4s ease":"none"}}>{isDone&&<span style={{color:"#fff",fontSize:13}}>✓</span>}</button>
                <span style={{fontSize:9,color:C.mtL,transform:isE?"rotate(180deg)":"none",transition:"transform .2s"}}>▼</span>
              </div>
            </div>
            {isE&&<div style={{padding:"0 13px 14px",borderTop:`1px solid ${C.bgW}`}}>
              <div style={{padding:"10px 0 5px"}}><h4 style={{fontFamily:dm,fontSize:12,fontWeight:700,color:C.dk,marginBottom:6}}>📝 Ingredients</h4>{(m.ingredients||[]).map((ing,j)=><div key={j} style={{fontFamily:dm,fontSize:12,color:C.dk,padding:"2px 0"}}><span style={{color:C.coral}}>•</span> {ing}</div>)}</div>
              <div style={{paddingTop:4}}><h4 style={{fontFamily:dm,fontSize:12,fontWeight:700,color:C.dk,marginBottom:6}}>👩‍🍳 Instructions</h4>{(m.instructions||[]).map((st,j)=><div key={j} style={{display:"flex",gap:6,padding:"3px 0"}}><div style={{width:20,height:20,borderRadius:"50%",background:`${C.coral}10`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontFamily:dm,fontSize:10,fontWeight:700,color:C.coral}}>{j+1}</span></div><span style={{fontFamily:dm,fontSize:12,color:C.mt,lineHeight:1.4}}>{st}</span></div>)}</div>
              <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>{[["Cal",m.cal],["Protein",m.protein],["Carbs",m.carbs],["Fat",m.fat]].map(([l,v],j)=><div key={j} style={{background:C.bgW,borderRadius:7,padding:"5px 10px",textAlign:"center"}}><div style={{fontFamily:dm,fontSize:8,color:C.mtL,textTransform:"uppercase"}}>{l}</div><div style={{fontFamily:dm,fontSize:13,fontWeight:700,color:C.dk,marginTop:1}}>{v}</div></div>)}</div>
            </div>}
          </div>})}

          {/* Plan switching for users with multiple plans */}
          {planHistory.length > 1 && <div style={{background:C.wh,borderRadius:14,padding:14,boxShadow:"0 1px 8px rgba(0,0,0,.03)",marginTop:12,marginBottom:8}}>
            <h4 style={{fontFamily:dm,fontSize:12,fontWeight:600,color:C.dk,marginBottom:8}}>📋 Your Saved Plans</h4>
            {planHistory.map((h,i) => <button key={i} onClick={()=>switchPlan(i)} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:C.bgW,borderRadius:8,border:"none",cursor:"pointer",marginBottom:4,textAlign:"left"}}>
              <span style={{fontFamily:dm,fontSize:11,fontWeight:600,color:C.coral}}>{i+1}</span>
              <span style={{fontFamily:dm,fontSize:11,color:C.dk,flex:1}}>{h.label}</span>
              <span style={{fontFamily:dm,fontSize:9,color:C.mtL}}>{new Date(h.createdAt).toLocaleDateString()}</span>
            </button>)}
          </div>}

          {/* 28-day upsell on dashboard — only for free users */}
          {!isPaid&&<div style={{background:`linear-gradient(135deg,${C.coral}06,${C.peach}10)`,borderRadius:14,padding:14,border:`1px solid ${C.coral}18`,marginTop:12,marginBottom:8,position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:0,right:0,background:C.coral,color:"#fff",fontFamily:dm,fontSize:8,fontWeight:700,padding:"3px 10px",borderBottomLeftRadius:8,letterSpacing:".04em"}}>MOST POPULAR</div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:6}}>
              <div><div style={{fontFamily:dm,fontSize:13,fontWeight:600,color:C.dk}}>⚡ Upgrade to 28-Day Plan</div><div style={{fontFamily:dm,fontSize:11,color:C.mtL,marginTop:1}}>4 weeks + unlimited regens + plan switching</div></div>
              <div style={{textAlign:"right"}}><div style={{fontFamily:pf,fontSize:20,fontWeight:700,color:C.coral}}>$9.99</div><div style={{fontFamily:dm,fontSize:9,color:C.mtL}}>USD</div></div>
            </div>
            <button onClick={onUpgrade} style={{width:"100%",background:`linear-gradient(135deg,${C.coral},${C.coralL})`,color:"#fff",border:"none",borderRadius:10,padding:"10px",fontFamily:dm,fontSize:13,fontWeight:600,cursor:"pointer",marginTop:10,animation:"glow 2s ease infinite"}}>Unlock Now →</button>
            <div style={{display:"flex",justifyContent:"center",marginTop:8}}><SocialProof/></div>
          </div>}

          {/* Etsy upsells */}
          {rel.length>0&&<div style={{marginTop:8}}><h4 style={{fontFamily:pf,fontSize:14,fontWeight:600,color:C.dk,marginBottom:6}}>Go deeper with your goals</h4>{rel.slice(0,2).map(p=><a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none",display:"flex",alignItems:"center",gap:10,background:C.wh,borderRadius:11,padding:10,marginBottom:5,boxShadow:"0 1px 5px rgba(0,0,0,.03)",border:`1px solid ${C.peachL}`}}><span style={{fontSize:22}}>{p.e}</span><div style={{flex:1}}><div style={{fontFamily:dm,fontSize:12,fontWeight:600,color:C.dk}}>{p.name}</div><div style={{fontFamily:dm,fontSize:10,color:C.mtL}}>PDF • <span style={{color:C.coral,fontWeight:600}}>{p.price}</span></div></div><span style={{fontFamily:dm,fontSize:10,color:C.coral,fontWeight:600}}>View →</span></a>)}</div>}
          </>}
        </>}

        {tab==="workout"&&<>
          {/* Safety Disclaimer Banner */}
          {!isCurrentWeekLocked && <div style={{background:`linear-gradient(135deg,${C.bl}08,${C.bl}15)`,borderLeft:`3px solid ${C.bl}`,borderRadius:10,padding:"10px 12px",marginBottom:10,display:"flex",alignItems:"flex-start",gap:8}}>
            <span style={{fontSize:16,flexShrink:0,marginTop:1}}>⚠️</span>
            <div style={{flex:1}}>
              <div style={{fontFamily:dm,fontSize:12,fontWeight:600,color:C.dk,lineHeight:1.4}}>Listen to your body</div>
              <div style={{fontFamily:dm,fontSize:11,color:C.mt,marginTop:2,lineHeight:1.4}}>If any movement causes pain, stop and try a modification. <button onClick={()=>setExp(exp==="safety"?null:"safety")} style={{background:"none",border:"none",color:C.bl,fontFamily:dm,fontSize:11,fontWeight:600,cursor:"pointer",padding:0,textDecoration:"underline"}}>Read full safety guide →</button></div>
            </div>
          </div>}

          {/* Expandable Full Safety Guide */}
          {exp==="safety" && !isCurrentWeekLocked && <div style={{background:C.wh,borderRadius:12,padding:16,marginBottom:10,boxShadow:"0 2px 12px rgba(0,0,0,.05)",animation:"slideUp 0.3s ease"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <h4 style={{fontFamily:pf,fontSize:15,fontWeight:600,color:C.dk}}>🛡️ Workout Safety Guide</h4>
              <button onClick={()=>setExp(null)} style={{background:"none",border:"none",fontSize:16,color:C.mtL,cursor:"pointer",padding:"0 4px"}}>✕</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:9}}>
              <div style={{display:"flex",gap:8}}>
                <span style={{fontSize:14,flexShrink:0}}>👩‍⚕️</span>
                <p style={{fontFamily:dm,fontSize:12,color:C.mt,lineHeight:1.5,margin:0}}><b style={{color:C.dk}}>Talk to your doctor first</b> — especially if you have existing knee, back, hip, or ankle issues, are pregnant or postpartum, recovering from injury, or have heart conditions.</p>
              </div>
              <div style={{display:"flex",gap:8}}>
                <span style={{fontSize:14,flexShrink:0}}>🦴</span>
                <p style={{fontFamily:dm,fontSize:12,color:C.mt,lineHeight:1.5,margin:0}}><b style={{color:C.dk}}>Joint-friendly swaps:</b> Replace squats with chair sit-stands · jumps with marches · planks with wall planks · lunges with split-stance squats · burpees with step-ups.</p>
              </div>
              <div style={{display:"flex",gap:8}}>
                <span style={{fontSize:14,flexShrink:0}}>📏</span>
                <p style={{fontFamily:dm,fontSize:12,color:C.mt,lineHeight:1.5,margin:0}}><b style={{color:C.dk}}>Heavier body type?</b> Start with seated, standing, or wall-supported versions of moves. Skip jumping/plyometrics until you build strength. Reduce reps if needed.</p>
              </div>
              <div style={{display:"flex",gap:8}}>
                <span style={{fontSize:14,flexShrink:0}}>🩹</span>
                <p style={{fontFamily:dm,fontSize:12,color:C.mt,lineHeight:1.5,margin:0}}><b style={{color:C.dk}}>Pain ≠ progress.</b> Sharp or shooting pain in joints means STOP. Sore muscles next day = normal. Sharp pain during = not normal.</p>
              </div>
              <div style={{display:"flex",gap:8}}>
                <span style={{fontSize:14,flexShrink:0}}>💧</span>
                <p style={{fontFamily:dm,fontSize:12,color:C.mt,lineHeight:1.5,margin:0}}><b style={{color:C.dk}}>Always:</b> Warm up 5 min · stay hydrated · breathe through every rep · rest 30-60 sec between sets · stop if dizzy or short of breath.</p>
              </div>
            </div>
            <div style={{background:C.bgW,borderRadius:8,padding:"8px 10px",marginTop:10}}>
              <p style={{fontFamily:dm,fontSize:10,color:C.mtL,lineHeight:1.4,margin:0,fontStyle:"italic"}}>This app provides general fitness guidance, not medical advice. By using these workouts, you acknowledge you exercise at your own risk. Stop and consult a healthcare professional if you experience pain, dizziness, or any concerning symptoms.</p>
            </div>
          </div>}

          {/* Week selector for workouts too */}
          {hasWeeks && <div style={{display:"flex",gap:6,marginBottom:10,padding:"4px",background:C.bgW,borderRadius:12}}>
            {[1,2,3,4].map(w => {
              const has = weekHasData(w);
              return <button key={w} onClick={()=>{setWeek(w);setDay(0)}} style={{flex:1,background:week===w?C.wh:"transparent",border:"none",borderRadius:9,padding:"8px 4px",cursor:"pointer",boxShadow:week===w?`0 2px 8px ${C.coral}20`:"none",transition:"all 0.2s ease"}}>
                <div style={{fontFamily:dm,fontSize:9,fontWeight:600,color:week===w?C.coral:C.mtL,textTransform:"uppercase",letterSpacing:".05em"}}>Week</div>
                <div style={{fontFamily:pf,fontSize:16,fontWeight:700,color:week===w?C.dk:C.mtL,marginTop:-2}}>{w}{!has && <span style={{fontSize:11,marginLeft:2}}>🔒</span>}</div>
              </button>;
            })}
          </div>}
          {/* Locked week CTA for workouts */}
          {isCurrentWeekLocked && <div style={{background:`linear-gradient(135deg,${C.peachL}40,${C.blush}60)`,borderRadius:16,padding:24,marginTop:16,textAlign:"center",border:`1px solid ${C.coral}25`,animation:"fadeScale 0.4s ease"}}>
            <span style={{fontSize:36}}>🔒</span>
            <h3 style={{fontFamily:pf,fontSize:18,fontWeight:600,color:C.dk,marginTop:8}}>Week {week} workouts locked</h3>
            <p style={{fontFamily:dm,fontSize:13,color:C.mt,marginTop:4,lineHeight:1.5,maxWidth:280,marginLeft:"auto",marginRight:"auto"}}>Generate Week {week} to unlock 7 days of workouts customized for your fitness level.</p>
            <Btn onClick={()=>generateWeek(week)} style={{marginTop:14,opacity:weekGenerating?0.6:1,cursor:weekGenerating?"not-allowed":"pointer"}} disabled={!!weekGenerating}>
              {weekGenerating === week ? "Generating..." : weekGenerating ? "Please wait..." : `Generate Week ${week} →`}
            </Btn>
          </div>}
          {!isCurrentWeekLocked && currentWeekWorkouts.map((w,i)=><div key={i} style={{background:C.wh,borderRadius:13,padding:13,boxShadow:"0 1px 8px rgba(0,0,0,.03)",marginBottom:7,border:i===day?`2px solid ${C.coral}`:"2px solid transparent"}}>
          <span style={{fontFamily:dm,fontSize:10,color:C.coral,fontWeight:600}}>{w.day}{i===day?" • Today":""}{hasWeeks?` • Week ${week}`:""}</span>
          <div style={{fontFamily:dm,fontSize:14,fontWeight:600,color:C.dk,marginTop:1}}>{w.icon} {w.name}</div>
          <span style={{fontFamily:dm,fontSize:11,color:C.mtL}}>{w.duration}</span>
          <div style={{display:"flex",flexDirection:"column",gap:5,marginTop:8}}>
            {(w.exercises||[]).map((ex,j)=>{
              const exKey = `ex-${i}-${j}`;
              const exObj = typeof ex === "string" ? {name:ex} : ex;
              const isExExp = exp === exKey;
              const hasMod = exObj.modification || exObj.alternative;
              return <div key={j} style={{background:C.bgW,borderRadius:8,overflow:"hidden",transition:"all 0.2s"}}>
                <div onClick={hasMod ? ()=>setExp(isExExp?null:exKey) : undefined} style={{display:"flex",alignItems:"center",gap:7,padding:"6px 9px",cursor:hasMod?"pointer":"default"}}>
                  <span style={{fontFamily:dm,fontSize:10,fontWeight:700,color:C.coral,width:14}}>{j+1}</span>
                  <span style={{fontFamily:dm,fontSize:11,fontWeight:600,color:C.dk,flex:1}}>{exObj.name}</span>
                  {exObj.detail && <span style={{fontFamily:dm,fontSize:10,color:C.mtL}}>{exObj.detail}</span>}
                  {hasMod && <span style={{fontSize:10,color:C.bl,opacity:0.7,marginLeft:4,transform:isExExp?"rotate(180deg)":"none",transition:"transform 0.2s"}}>▾</span>}
                </div>
                {isExExp && hasMod && <div style={{padding:"8px 12px 10px 32px",background:`${C.bl}06`,borderTop:`1px solid ${C.bl}15`}}>
                  <div style={{display:"flex",gap:6,alignItems:"flex-start"}}>
                    <span style={{fontSize:11,marginTop:1}}>🪑</span>
                    <div style={{flex:1}}>
                      <div style={{fontFamily:dm,fontSize:9,fontWeight:700,color:C.bl,textTransform:"uppercase",letterSpacing:".05em"}}>Easier Modification</div>
                      <p style={{fontFamily:dm,fontSize:11,color:C.mt,lineHeight:1.5,marginTop:2}}>{exObj.modification || exObj.alternative}</p>
                    </div>
                  </div>
                </div>}
              </div>;
            })}
          </div>
        </div>)}
        </>}

        {tab==="grocery"&&<>
          {isCurrentWeekLocked && <div style={{background:`linear-gradient(135deg,${C.peachL}40,${C.blush}60)`,borderRadius:16,padding:24,marginTop:16,textAlign:"center",border:`1px solid ${C.coral}25`,animation:"fadeScale 0.4s ease"}}>
            <span style={{fontSize:36}}>🔒</span>
            <h3 style={{fontFamily:pf,fontSize:18,fontWeight:600,color:C.dk,marginTop:8}}>Week {week} grocery list locked</h3>
            <p style={{fontFamily:dm,fontSize:13,color:C.mt,marginTop:4,lineHeight:1.5,maxWidth:280,marginLeft:"auto",marginRight:"auto"}}>Generate Week {week} to unlock its complete grocery list.</p>
            <Btn onClick={()=>generateWeek(week)} style={{marginTop:14,opacity:weekGenerating?0.6:1,cursor:weekGenerating?"not-allowed":"pointer"}} disabled={!!weekGenerating}>
              {weekGenerating === week ? "Generating..." : weekGenerating ? "Please wait..." : `Generate Week ${week} →`}
            </Btn>
          </div>}
          {!isCurrentWeekLocked && (plan.grocery_list||[]).map((g,i)=><div key={i} style={{marginBottom:12}}><h4 style={{fontFamily:dm,fontSize:13,fontWeight:600,color:C.dk,marginBottom:5}}>{g.category}</h4><div style={{background:C.wh,borderRadius:11,boxShadow:"0 1px 6px rgba(0,0,0,.03)"}}>{(g.items||[]).map((item,j)=><div key={j} style={{display:"flex",alignItems:"center",gap:7,padding:"8px 12px",borderBottom:j<g.items.length-1?`1px solid ${C.bgW}`:"none"}}><div style={{width:16,height:16,borderRadius:4,border:`2px solid ${C.peachL}`,flexShrink:0}}/><span style={{fontFamily:dm,fontSize:12,color:C.dk}}>{item}</span></div>)}</div></div>)}
        </>}
      </div>
    </>}

    {btab==="progress"&&<div style={{padding:"14px 16px"}}>
      <h2 style={{fontFamily:pf,fontSize:20,fontWeight:600,color:C.dk}}>Your Progress</h2>
      <p style={{fontFamily:dm,fontSize:12,color:C.mt,marginTop:2,marginBottom:14}}>Track your daily wellness</p>

      {/* Today's nutrition from meal plan */}
      <div style={{background:C.wh,borderRadius:13,padding:14,boxShadow:"0 1px 8px rgba(0,0,0,.03)",marginBottom:10}}>
        <h4 style={{fontFamily:dm,fontSize:12,fontWeight:600,color:C.dk,marginBottom:10}}>Today's Nutrition ({plan.meal_plan[day]?.day || "Day "+(day+1)})</h4>
        <div style={{display:"flex",gap:8}}>
          {[
            {l:"Calories",v:meals.reduce((s,m)=>s+(m.cal||0),0),u:"kcal",c:C.coral},
            {l:"Protein",v:meals.reduce((s,m)=>s+parseInt(m.protein||"0"),0),u:"g",c:C.gr},
            {l:"Carbs",v:meals.reduce((s,m)=>s+parseInt(m.carbs||"0"),0),u:"g",c:C.bl},
            {l:"Fat",v:meals.reduce((s,m)=>s+parseInt(m.fat||"0"),0),u:"g",c:C.gold}
          ].map((s,i) => <div key={i} style={{flex:1,background:C.bgW,borderRadius:10,padding:"10px 6px",textAlign:"center"}}>
            <div style={{fontFamily:dm,fontSize:8,color:C.mtL,textTransform:"uppercase",letterSpacing:".04em"}}>{s.l}</div>
            <div style={{fontFamily:pf,fontSize:20,fontWeight:700,color:s.c,marginTop:2}}>{s.v}</div>
            <div style={{fontFamily:dm,fontSize:9,color:C.mtL}}>{s.u}</div>
          </div>)}
        </div>
      </div>

      {/* Weekly overview with calories per day */}
      <div style={{background:C.wh,borderRadius:13,padding:14,boxShadow:"0 1px 8px rgba(0,0,0,.03)",marginBottom:10}}>
        <h4 style={{fontFamily:dm,fontSize:12,fontWeight:600,color:C.dk,marginBottom:10}}>Weekly Calorie Overview</h4>
        <div style={{display:"flex",gap:4,alignItems:"flex-end",height:100,marginBottom:8}}>
          {plan.meal_plan.map((d,i) => {
            const dayCal = (d.meals||[]).reduce((s,m)=>s+(m.cal||0),0);
            const maxCal = Math.max(...plan.meal_plan.map(dd=>(dd.meals||[]).reduce((s,m)=>s+(m.cal||0),0)));
            const h = maxCal > 0 ? (dayCal/maxCal)*80 : 40;
            return <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
              <span style={{fontFamily:dm,fontSize:8,color:C.mt}}>{dayCal}</span>
              <div style={{width:"100%",height:h,borderRadius:6,background:i===day?C.coral:`${C.coral}30`,transition:"all .3s"}}/>
              <span style={{fontFamily:dm,fontSize:8,color:i===day?C.coral:C.mtL,fontWeight:i===day?700:400}}>{d.day?.slice(0,2)}</span>
            </div>;
          })}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderTop:`1px solid ${C.bgW}`}}>
          <div style={{textAlign:"center"}}><div style={{fontFamily:dm,fontSize:8,color:C.mtL,textTransform:"uppercase"}}>Weekly Total</div><div style={{fontFamily:pf,fontSize:18,fontWeight:700,color:C.dk,marginTop:2}}>{plan.meal_plan.reduce((s,d)=>s+(d.meals||[]).reduce((ss,m)=>ss+(m.cal||0),0),0).toLocaleString()}</div><div style={{fontFamily:dm,fontSize:9,color:C.mtL}}>kcal</div></div>
          <div style={{textAlign:"center"}}><div style={{fontFamily:dm,fontSize:8,color:C.mtL,textTransform:"uppercase"}}>Daily Average</div><div style={{fontFamily:pf,fontSize:18,fontWeight:700,color:C.dk,marginTop:2}}>{Math.round(plan.meal_plan.reduce((s,d)=>s+(d.meals||[]).reduce((ss,m)=>ss+(m.cal||0),0),0)/7)}</div><div style={{fontFamily:dm,fontSize:9,color:C.mtL}}>kcal/day</div></div>
          <div style={{textAlign:"center"}}><div style={{fontFamily:dm,fontSize:8,color:C.mtL,textTransform:"uppercase"}}>Avg Protein</div><div style={{fontFamily:pf,fontSize:18,fontWeight:700,color:C.gr,marginTop:2}}>{Math.round(plan.meal_plan.reduce((s,d)=>s+(d.meals||[]).reduce((ss,m)=>ss+parseInt(m.protein||"0"),0),0)/7)}</div><div style={{fontFamily:dm,fontSize:9,color:C.mtL}}>g/day</div></div>
        </div>
      </div>

      {/* Mood tracker */}
      <div style={{background:C.wh,borderRadius:13,padding:14,boxShadow:"0 1px 8px rgba(0,0,0,.03)",marginBottom:10}}>
        <h4 style={{fontFamily:dm,fontSize:12,fontWeight:600,color:C.dk,marginBottom:8}}>How are you feeling today?</h4>
        <div style={{display:"flex",gap:8}}>{[["😊","Great"],["🙂","Good"],["😐","Okay"],["😔","Low"]].map(([e,l]) => <button key={l} onClick={()=>setMood(l)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"8px 3px",borderRadius:10,border:mood===l?`2px solid ${C.coral}`:"2px solid transparent",background:mood===l?`${C.coral}06`:C.bgW,cursor:"pointer"}}><span style={{fontSize:22}}>{e}</span><span style={{fontFamily:dm,fontSize:9,color:mood===l?C.coral:C.mt}}>{l}</span></button>)}</div>
      </div>

      {/* Water tracker */}
      <div style={{background:C.wh,borderRadius:13,padding:14,boxShadow:"0 1px 8px rgba(0,0,0,.03)",marginBottom:10}}>
        <h4 style={{fontFamily:dm,fontSize:12,fontWeight:600,color:C.dk,marginBottom:8}}>Water Intake</h4>
        <div style={{display:"flex",gap:5,justifyContent:"center"}}>{Array.from({length:8}).map((_,i) => <button key={i} onClick={()=>setWater(i+1)} style={{width:32,height:32,borderRadius:8,border:"none",background:i<water?C.bl:C.peachL,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all .2s"}}><span style={{fontSize:14,opacity:i<water?1:.3}}>💧</span></button>)}</div>
        <p style={{fontFamily:dm,fontSize:11,color:C.mt,textAlign:"center",marginTop:6}}>{water} of 8 glasses</p>
      </div>
    </div>}

    {btab==="library"&&<div style={{padding:"14px 16px"}}>
      <h2 style={{fontFamily:pf,fontSize:20,fontWeight:600,color:C.dk}}>Recipe Library</h2>
      <p style={{fontFamily:dm,fontSize:12,color:C.mt,marginTop:2,marginBottom:14}}>Tap any recipe to see full details</p>
      {["Breakfast","Lunch","Snack","Dinner"].map((cat,ci) => {
        const cm = plan.meal_plan.flatMap(d => (d.meals||[]).filter(m => m.time===cat)).filter((m,i,a) => a.findIndex(x => x.name===m.name)===i);
        return <div key={cat}>
          <h3 style={{fontFamily:dm,fontSize:11,fontWeight:600,color:C.coral,textTransform:"uppercase",letterSpacing:".06em",marginBottom:6,marginTop:ci?14:0}}>{cat} ({cm.length} recipes)</h3>
          {cm.map((m,i) => {
            const lk = `lib-${cat}-${i}`;
            const isOpen = libExp === lk;
            return <div key={i} style={{background:C.wh,borderRadius:12,marginBottom:6,overflow:"hidden",boxShadow:"0 1px 6px rgba(0,0,0,.03)"}}>
              <div onClick={() => setLibExp(isOpen ? null : lk)} style={{padding:"11px 12px",display:"flex",gap:9,alignItems:"center",cursor:"pointer"}}>
                <span style={{fontSize:20}}>{m.emoji}</span>
                <div style={{flex:1}}>
                  <div style={{fontFamily:dm,fontSize:13,fontWeight:600,color:C.dk}}>{m.name}</div>
                  <div style={{fontFamily:dm,fontSize:10,color:C.mtL}}>{m.cal} cal • {m.protein} protein • {m.prep_time}</div>
                </div>
                <span style={{fontSize:10,color:C.mtL,transform:isOpen?"rotate(180deg)":"none",transition:"transform .2s"}}>▼</span>
              </div>
              {isOpen && <div style={{padding:"0 12px 14px",borderTop:`1px solid ${C.bgW}`}}>
                <p style={{fontFamily:dm,fontSize:11,color:C.mt,padding:"8px 0 6px"}}>{m.desc}</p>
                <h4 style={{fontFamily:dm,fontSize:11,fontWeight:700,color:C.dk,marginBottom:4}}>📝 Ingredients</h4>
                {(m.ingredients||[]).map((ing,j) => <div key={j} style={{fontFamily:dm,fontSize:11,color:C.dk,padding:"2px 0"}}><span style={{color:C.coral}}>•</span> {ing}</div>)}
                <h4 style={{fontFamily:dm,fontSize:11,fontWeight:700,color:C.dk,marginTop:8,marginBottom:4}}>👩‍🍳 Instructions</h4>
                {(m.instructions||[]).map((st,j) => <div key={j} style={{display:"flex",gap:6,padding:"2px 0"}}>
                  <div style={{width:18,height:18,borderRadius:"50%",background:`${C.coral}10`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontFamily:dm,fontSize:9,fontWeight:700,color:C.coral}}>{j+1}</span></div>
                  <span style={{fontFamily:dm,fontSize:11,color:C.mt,lineHeight:1.4}}>{st}</span>
                </div>)}
                <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
                  {[["Cal",m.cal],["Protein",m.protein],["Carbs",m.carbs],["Fat",m.fat]].map(([l,v],j) => <span key={j} style={{fontFamily:dm,fontSize:9,background:C.bgW,padding:"3px 8px",borderRadius:6,color:C.mt}}>{l}: <b>{v}</b></span>)}
                </div>
              </div>}
            </div>;
          })}
        </div>;
      })}
    </div>}

    {btab==="settings"&&<div style={{padding:"14px 16px"}}>
      <h2 style={{fontFamily:pf,fontSize:20,fontWeight:600,color:C.dk}}>Settings</h2>
      <div style={{background:C.wh,borderRadius:13,padding:14,boxShadow:"0 1px 8px rgba(0,0,0,.03)",marginTop:12,marginBottom:10,display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:40,height:40,borderRadius:"50%",background:`linear-gradient(135deg,${C.coral},${C.peach})`,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontFamily:pf,fontSize:18,fontWeight:700}}>{user?.name?.[0]?.toUpperCase()||"U"}</div>
        <div><div style={{fontFamily:dm,fontSize:15,fontWeight:600,color:C.dk}}>{user?.name||"User"}</div><div style={{fontFamily:dm,fontSize:11,color:C.mtL}}>{user?.email||""}</div></div>
      </div>
      <div style={{background:C.wh,borderRadius:13,padding:14,boxShadow:"0 1px 8px rgba(0,0,0,.03)",marginBottom:10}}>
        <h4 style={{fontFamily:dm,fontSize:12,fontWeight:600,color:C.dk,marginBottom:8}}>Current Plan</h4>
        {[["Goal",answers.goal],["Diet",dietToString(answers.diet)],["Fitness",answers.fitness],["Cook Time",answers.time],["Focus",(answers.focus||[]).join(", ")]].map(([l,v],i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:i<4?`1px solid ${C.bgW}`:"none"}}><span style={{fontFamily:dm,fontSize:12,color:C.mtL}}>{l}</span><span style={{fontFamily:dm,fontSize:12,fontWeight:600,color:C.dk,textAlign:"right",maxWidth:"55%"}}>{v||"—"}</span></div>)}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:7}}>
        <button onClick={onRegen} style={{width:"100%",background:C.wh,border:`2px solid ${C.coral}`,borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}><span style={{fontSize:16}}>🔄</span><div style={{textAlign:"left"}}><div style={{fontFamily:dm,fontSize:13,fontWeight:600,color:C.coral}}>Generate New Plan <span style={{fontFamily:dm,fontSize:11,color:C.mtL,fontWeight:400}}>({genCount}/{isPaid?MAX_PAID_GENS:MAX_FREE_GENS} used)</span></div><div style={{fontFamily:dm,fontSize:10,color:C.mtL}}>{isPaid?"Premium plan generations":"Retake quiz with new preferences"}</div></div></button>
        {!isPaid&&<button onClick={onUpgrade} style={{width:"100%",background:`linear-gradient(135deg,${C.coral},${C.coralL})`,border:"none",borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}><span style={{fontSize:16}}>⚡</span><div style={{textAlign:"left"}}><div style={{fontFamily:dm,fontSize:13,fontWeight:600,color:"#fff"}}>Upgrade to Premium — $9.99 USD</div><div style={{fontFamily:dm,fontSize:10,color:"#ffffffaa"}}>28-day plan + 10 gens + PDF download</div></div></button>}
        <button onClick={()=>window.open(INSTAGRAM_LINK,"_blank")} style={{width:"100%",background:C.wh,border:`2px solid ${C.peachL}`,borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}><span style={{fontSize:16}}>📸</span><div style={{textAlign:"left"}}><div style={{fontFamily:dm,fontSize:13,fontWeight:600,color:C.dk}}>Follow @fitwithhiral</div><div style={{fontFamily:dm,fontSize:10,color:C.mtL}}>Tips, recipes & wellness on Instagram</div></div></button>
        <button onClick={()=>setBtab("home")} style={{width:"100%",background:C.wh,border:`2px solid ${C.peachL}`,borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}><span style={{fontSize:16}}>🏠</span><div style={{textAlign:"left"}}><div style={{fontFamily:dm,fontSize:13,fontWeight:600,color:C.dk}}>Back to Home</div><div style={{fontFamily:dm,fontSize:10,color:C.mtL}}>Return to your dashboard</div></div></button>
        {isPaid && <button onClick={generatePDF} style={{width:"100%",background:`linear-gradient(135deg,${C.coral}10,${C.peach}10)`,border:`2px solid ${C.coral}40`,borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}><span style={{fontSize:16}}>📄</span><div style={{textAlign:"left"}}><div style={{fontFamily:dm,fontSize:13,fontWeight:600,color:C.dk}}>Download Plan as PDF</div><div style={{fontFamily:dm,fontSize:10,color:C.mtL}}>Beautifully designed, printable</div></div></button>}
        <button onClick={()=>window.open("https://www.etsy.com/shop/FitWithHiral","_blank")} style={{width:"100%",background:C.wh,border:`2px solid ${C.peachL}`,borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}><span style={{fontSize:16}}>🛍️</span><div style={{textAlign:"left"}}><div style={{fontFamily:dm,fontSize:13,fontWeight:600,color:C.dk}}>Visit Etsy Shop</div></div></button>
        <button onClick={onReset} style={{width:"100%",background:"none",border:`1px solid ${C.peachL}`,borderRadius:12,padding:"10px 16px",display:"flex",alignItems:"center",gap:8,cursor:"pointer",marginTop:6}}><span style={{fontSize:14}}>🚪</span><div style={{textAlign:"left"}}><div style={{fontFamily:dm,fontSize:12,fontWeight:600,color:C.mt}}>Log Out</div></div></button>
      </div>
      <p style={{fontFamily:dm,fontSize:10,color:C.mtL,textAlign:"center",marginTop:20}}>Nourish You by FitWithHiral v1.0</p>
    </div>}

    {/* Bottom nav */}
    <div style={{position:"fixed",bottom:0,left:0,right:0,background:C.wh,borderTop:`1px solid ${C.peachL}`,display:"flex",justifyContent:"space-around",padding:"7px 0 16px",zIndex:20}}>
      {[["home","🏠","Home"],["plan","🥗","Plan"],["progress","📊","Progress"],["library","📚","Library"],["settings","⚙️","Settings"]].map(([id,icon,lbl])=><button key={id} onClick={()=>setBtab(id)} style={{background:"none",border:"none",display:"flex",flexDirection:"column",alignItems:"center",gap:1,cursor:"pointer",opacity:btab===id?1:.65}}><span style={{fontSize:17}}>{icon}</span><span style={{fontFamily:dm,fontSize:8,color:btab===id?C.coral:C.mt,fontWeight:btab===id?700:500}}>{lbl}</span></button>)}
    </div>
  </div>;
}

// ─── GENERATION LIMIT SCREEN ───
function LimitScreen({genCount, onUpgrade, onHome, expired, user, onSignupDifferent}){
  return <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:28}}>
    <Fi delay={100}><div style={{width:70,height:70,borderRadius:"50%",background:`${C.coral}12`,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:16,animation:"float 3s ease infinite"}}><span style={{fontSize:36}}>{expired ? "⏰" : "🔒"}</span></div></Fi>
    <Fi delay={200}><h2 style={{fontFamily:pf,fontSize:24,fontWeight:600,color:C.dk,textAlign:"center"}}>{expired ? (user?.name ? `Welcome back, ${user.name}!` : "Welcome back!") : "You've used all "+MAX_FREE_GENS+" free plans"}</h2></Fi>
    <Fi delay={300}><p style={{fontFamily:dm,fontSize:14,color:C.mt,textAlign:"center",maxWidth:340,lineHeight:1.6,marginTop:8}}>{expired ? "Your 7-day free access has ended. Upgrade to unlock your full 28-day plan and keep your saved progress — or create a new account with a different email." : "Upgrade to unlock unlimited plan generations and a full 28-day program."}</p></Fi>
    <Fi delay={400}><div style={{background:C.wh,borderRadius:16,padding:18,marginTop:20,width:"100%",maxWidth:340,position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:0,right:0,background:C.coral,color:"#fff",fontFamily:dm,fontSize:8,fontWeight:700,padding:"3px 10px",borderBottomLeftRadius:8,letterSpacing:".04em"}}>MOST POPULAR</div>
      <div style={{marginTop:4}}>
        {["10 plan generations","Full 28-day meal + workout plan","Complete weekly grocery lists","Progress tracking dashboard","Switch between saved plans","📄 Download your plan as PDF","Keep your existing data"].map((f,i) => <div key={i} style={{display:"flex",gap:8,alignItems:"center",padding:"5px 0"}}><span style={{color:C.gr,fontSize:13}}>✓</span><span style={{fontFamily:dm,fontSize:13,color:C.mt}}>{f}</span></div>)}
        <div style={{display:"flex",alignItems:"baseline",gap:6,margin:"14px 0 4px"}}><span style={{fontFamily:dm,fontSize:13,color:C.mtL,textDecoration:"line-through"}}>$29.99 USD</span><span style={{fontFamily:pf,fontSize:30,fontWeight:700,color:C.coral}}>$9.99</span><span style={{fontFamily:dm,fontSize:11,color:C.mtL}}>USD • one-time</span></div>
        <Btn full onClick={onUpgrade} style={{marginTop:10,animation:"glow 2s ease infinite"}}>Upgrade Now — $9.99 USD</Btn>
        <p style={{fontFamily:dm,fontSize:10,color:C.mtL,textAlign:"center",marginTop:6}}>🔒 Secure payment via Stripe</p>
      </div>
    </div></Fi>
    {expired && onSignupDifferent && <Fi delay={500}><div style={{marginTop:20,padding:"12px 16px",background:`${C.peachL}40`,borderRadius:12,maxWidth:340,width:"100%",textAlign:"center"}}>
      <p style={{fontFamily:dm,fontSize:12,color:C.mt,marginBottom:6}}>Want to try with a different email?</p>
      <button onClick={onSignupDifferent} style={{background:"none",border:"none",fontFamily:dm,fontSize:13,fontWeight:600,color:C.coral,cursor:"pointer",textDecoration:"underline"}}>Sign up with a different email →</button>
    </div></Fi>}
    <Fi delay={600}><button onClick={onHome} style={{background:"none",border:"none",fontFamily:dm,fontSize:13,color:C.mtL,cursor:"pointer",marginTop:14,padding:"8px 16px"}}>← Back to Home</button></Fi>
  </div>;
}

// ─── SESSION HELPERS (persist across page refresh) ───
function saveSession(data) {
  try { window.localStorage.setItem("nh_session", JSON.stringify(data)); } catch(e) {}
}
function loadSession() {
  try { const d = window.localStorage.getItem("nh_session"); return d ? JSON.parse(d) : null; } catch(e) { return null; }
}
function clearSession() {
  try { window.localStorage.removeItem("nh_session"); } catch(e) {}
}

// ─── PAYMENT SUCCESS SCREEN ───
function PaymentSuccessScreen({user, onContinue}) {
  return <div style={{minHeight:"100vh",background:`linear-gradient(170deg,${C.bg},${C.bgW})`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:28}}>
    <Fi delay={100}><div style={{width:80,height:80,borderRadius:"50%",background:C.grL,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:16,animation:"bounceIn 0.6s ease"}}><span style={{fontSize:40}}>🎉</span></div></Fi>
    <Fi delay={250}><h2 style={{fontFamily:pf,fontSize:26,fontWeight:600,color:C.dk,textAlign:"center"}}>Payment Successful!</h2></Fi>
    <Fi delay={350}><p style={{fontFamily:dm,fontSize:15,color:C.mt,textAlign:"center",maxWidth:320,lineHeight:1.6,marginTop:8}}>Welcome to Premium, {user?.name || "there"}! Your full 28-day plan with unlimited regenerations is now unlocked.</p></Fi>
    <Fi delay={500}><div style={{background:C.wh,borderRadius:16,padding:18,marginTop:20,width:"100%",maxWidth:340}}>
      {["✅ Full 28-day meal + workout plan","✅ 10 plan generations","✅ Complete weekly grocery lists","✅ Progress tracking dashboard","✅ Switch between saved plans","✅ 📄 Download your plan as PDF"].map((f,i) => <div key={i} style={{padding:"6px 0"}}><span style={{fontFamily:dm,fontSize:14,color:C.dk}}>{f}</span></div>)}
    </div></Fi>
    <Fi delay={650}><Btn onClick={onContinue} style={{marginTop:20,animation:"glow 2s ease infinite"}}>Go to My Dashboard →</Btn></Fi>
    <Fi delay={750}><p style={{fontFamily:dm,fontSize:11,color:C.mtL,marginTop:12}}>A confirmation email has been sent to your inbox.</p></Fi>
  </div>;
}

// ─── ADD TO HOME SCREEN PROMPT ───
function AddToHomePrompt({onDismiss}) {
  const[show,setShow]=useState(false);
  useEffect(()=>{
    const dismissed = window.localStorage.getItem("nh_a2hs_dismissed");
    if(!dismissed) setTimeout(()=>setShow(true), 5000);
  },[]);
  if(!show) return null;
  const dismiss=()=>{setShow(false);window.localStorage.setItem("nh_a2hs_dismissed","1");if(onDismiss)onDismiss()};
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  return <div style={{position:"fixed",bottom:70,left:12,right:12,background:C.wh,borderRadius:16,padding:16,boxShadow:"0 8px 40px rgba(0,0,0,.12)",zIndex:100,animation:"slideUp 0.4s ease",border:`1px solid ${C.peachL}`}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
      <div style={{flex:1}}>
        <div style={{fontFamily:dm,fontSize:14,fontWeight:600,color:C.dk}}>📱 Add to Home Screen</div>
        <p style={{fontFamily:dm,fontSize:12,color:C.mt,marginTop:4,lineHeight:1.4}}>
          {isIOS ? "Tap the share button ⬆️ in Safari, then \"Add to Home Screen\" for quick access." : "Tap the menu (⋮) in your browser, then \"Add to Home Screen\" for instant access."}
        </p>
      </div>
      <button onClick={dismiss} style={{background:"none",border:"none",fontSize:18,color:C.mtL,cursor:"pointer",padding:"0 0 0 8px"}}>✕</button>
    </div>
  </div>;
}

// ─── MAIN APP ───
export default function App(){
  const[screen,setScreen]=useState("welcome");const[step,setStep]=useState(0);const[answers,setAnswers]=useState({});const[user,setUser]=useState(null);const[plan,setPlan]=useState(null);const[progress,setProgress]=useState(0);
  const insertedTimestamps = useRef(new Set()); // Prevents duplicate plan inserts from React StrictMode/re-renders
  const[genCount,setGenCount]=useState(0);const[isPaid,setIsPaid]=useState(false);const[planHistory,setPlanHistory]=useState([]);const[planCreatedAt,setPlanCreatedAt]=useState(null);const[expired,setExpired]=useState(false);
  const[showA2HS,setShowA2HS]=useState(true);

  // On mount: restore session + check for Stripe payment redirect
  useEffect(()=>{
    const init = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const isPaymentReturn = params.get("payment") === "success";

        // Try to restore saved session
        const session = loadSession();

        if (isPaymentReturn && session?.email) {
          // User just paid — look them up and mark as paid
          const lead = await sbFind("leads", "email", session.email);
          if (lead) {
            await sbUpdate("leads", lead.id, { has_paid: true, paid_at: new Date().toISOString() });
            setUser({ name: lead.name, email: lead.email, leadId: lead.id });
            setIsPaid(true);
            setExpired(false);
            setGenCount(lead.generation_count || 0);
            setAnswers({ goal: lead.goal, diet: lead.diet_type, fitness: lead.fitness_level, time: lead.cooking_time, focus: lead.focus_areas });
            // Load ALL their plans (most recent first)
            const allPlans = await sbFindAll("plans", "lead_id", lead.id);
            if (allPlans.length > 0) {
              const ep = allPlans[0]; // Most recent
              setPlan({ meal_plan: ep.meal_plan, workout_plan: ep.workout_plan, grocery_list: ep.grocery_list });
              setPlanCreatedAt(ep.created_at);
              // Build history from all plans (oldest first for numbering)
              const history = [...allPlans].reverse().map((p, i) => ({
                plan: { meal_plan: p.meal_plan, workout_plan: p.workout_plan, grocery_list: p.grocery_list },
                answers: { goal: lead.goal, diet: lead.diet_type, fitness: lead.fitness_level, time: lead.cooking_time, focus: lead.focus_areas },
                createdAt: p.created_at,
                label: "Plan " + (i + 1) + ": " + (lead.goal || "Plan") + " (" + dietToString(lead.diet_type) + ")"
              }));
              setPlanHistory(history);
            }
            saveSession({ email: lead.email, name: lead.name, leadId: lead.id, isPaid: true });
            setScreen("payment-success");
            // Clean URL
            window.history.replaceState({}, "", window.location.pathname);
          }
        } else if (session?.email) {
          // Returning user — auto-login
          const lead = await sbFind("leads", "email", session.email);
          if (lead) {
            setUser({ name: lead.name, email: lead.email, leadId: lead.id });
            setGenCount(lead.generation_count || 0);
            setIsPaid(lead.has_paid || false);
            setAnswers({ goal: lead.goal, diet: lead.diet_type, fitness: lead.fitness_level, time: lead.cooking_time, focus: lead.focus_areas });
            const allPlans = await sbFindAll("plans", "lead_id", lead.id);
            if (allPlans.length > 0) {
              const ep = allPlans[0]; // Most recent
              setPlan({ meal_plan: ep.meal_plan, workout_plan: ep.workout_plan, grocery_list: ep.grocery_list });
              setPlanCreatedAt(ep.created_at);
              // Build history from all saved plans
              const history = [...allPlans].reverse().map((p, i) => ({
                plan: { meal_plan: p.meal_plan, workout_plan: p.workout_plan, grocery_list: p.grocery_list },
                answers: { goal: lead.goal, diet: lead.diet_type, fitness: lead.fitness_level, time: lead.cooking_time, focus: lead.focus_areas },
                createdAt: p.created_at,
                label: "Plan " + (i + 1) + ": " + (lead.goal || "Plan") + " (" + dietToString(lead.diet_type) + ")"
              }));
              setPlanHistory(history);
              // Check expiry: 7 days free, 28 days paid
              if (ep.created_at) {
                const daysPassed = Math.floor((new Date() - new Date(ep.created_at)) / (86400000));
                const limit = lead.has_paid ? PAID_ACCESS_DAYS : FREE_ACCESS_DAYS;
                if (daysPassed >= limit) { setExpired(true); setScreen("limit"); return; }
              }
              setScreen("dashboard");
            } else {
              setScreen("quiz");
            }
          }
        }
      } catch(e) { console.warn("Init error:", e); }
    };
    init();
  }, []);

  // Check expiry: 7 days for free, 28 days for paid
  useEffect(()=>{
    if(planCreatedAt){
      const daysPassed = Math.floor((Date.now() - new Date(planCreatedAt).getTime()) / (86400000));
      const limit = isPaid ? PAID_ACCESS_DAYS : FREE_ACCESS_DAYS;
      if(daysPassed >= limit) setExpired(true);
    }
  },[isPaid, planCreatedAt]);

  const onEmail = (u) => {
    setUser(u);
    saveSession({ email: u.email, name: u.name, leadId: u.leadId, isPaid: false });
    setScreen("quiz");
  };

  const onLogin = async (lead) => {
    setUser({ name: lead.name, email: lead.email, leadId: lead.id });
    setAnswers({ goal: lead.goal, diet: lead.diet_type, fitness: lead.fitness_level, time: lead.cooking_time, focus: lead.focus_areas });
    setGenCount(lead.generation_count || 0);
    setIsPaid(lead.has_paid || false);
    saveSession({ email: lead.email, name: lead.name, leadId: lead.id, isPaid: lead.has_paid || false });
    const allPlans = await sbFindAll("plans", "lead_id", lead.id);
    if (allPlans.length > 0) {
      const ep = allPlans[0]; // Most recent
      setPlan({ meal_plan: ep.meal_plan, workout_plan: ep.workout_plan, grocery_list: ep.grocery_list });
      setPlanCreatedAt(ep.created_at);
      const history = [...allPlans].reverse().map((p, i) => ({
        plan: { meal_plan: p.meal_plan, workout_plan: p.workout_plan, grocery_list: p.grocery_list },
        answers: { goal: lead.goal, diet: lead.diet_type, fitness: lead.fitness_level, time: lead.cooking_time, focus: lead.focus_areas },
        createdAt: p.created_at,
        label: "Plan " + (i + 1) + ": " + (lead.goal || "Plan") + " (" + dietToString(lead.diet_type) + ")"
      }));
      setPlanHistory(history);
      if (ep.created_at) {
        const daysPassed = Math.floor((new Date() - new Date(ep.created_at)) / (86400000));
        const limit = lead.has_paid ? PAID_ACCESS_DAYS : FREE_ACCESS_DAYS;
        if (daysPassed >= limit) { setExpired(true); setScreen("limit"); return; }
      }
      setScreen("dashboard");
    } else { setScreen("quiz"); }
  };

  const onAnswer = (id, val) => {
    setAnswers(p => ({ ...p, [id]: val }));
    if (!QUIZ[step].multi && step < QUIZ.length - 1) setTimeout(() => setStep(s => s + 1), 250);
  };

  const onNext = async () => {
    if (step < QUIZ.length - 1) { setStep(s => s + 1); return; }
    setScreen("loading"); setProgress(0);

    const newCount = genCount + 1;
    setGenCount(newCount);

    if (user?.leadId) sbUpdate("leads", user.leadId, { goal: answers.goal, diet_type: dietToString(answers.diet), fitness_level: answers.fitness, cooking_time: answers.time, focus_areas: answers.focus || [], generation_count: newCount });

    const now = new Date().toISOString();
    setPlanCreatedAt(now);

    // Start progress animation — slowly climb to 90% while AI works
    // Slow progress climb that matches realistic 60-120s generation window
    // 0->50 in 30s, 50->80 in 30s, 80->90 in 30s = ~90s to reach 90%
    let p = 0;
    const iv = setInterval(() => {
      const increment = p < 50 ? 0.4 : p < 80 ? 0.2 : 0.1;
      p += increment;
      setProgress(Math.min(p, 90));
      if (p >= 90) clearInterval(iv);
    }, 100);

    // Try AI first — for paid users, only generate Week 1 to keep it fast/reliable
    // Weeks 2-4 will be generated on-demand later
    let result = null;
    try {
      const weekToGenerate = isPaid ? 1 : null; // Paid: just week 1; Free: 7 days
      result = await aiGenerate(answers, isPaid, weekToGenerate);
    } catch(e) {
      console.warn("AI error:", e);
    }

    // Fallback only if AI fails
    if (!result || !result.meal_plan || result.meal_plan.length === 0) {
      console.log("Using fallback plan");
      // For paid users, still only fallback for week 1 (so others can be generated later)
      const fallbackResult = makeFallback(answers, false); // false = just 7 days
      result = fallbackResult;
    } else {
      console.log("Using AI-generated plan with", result.meal_plan.length, "days");
    }

    // Finish progress animation
    clearInterval(iv);
    let fp = p;
    const finishIv = setInterval(() => {
      fp += 3; setProgress(Math.min(fp, 100));
      if (fp >= 100) {
        clearInterval(finishIv);
        setTimeout(() => {
          setPlan(result);
          // Use timestamp-based dedup: only push if not already in history
          setPlanHistory(prev => {
            if (prev.some(p => p.createdAt === now)) return prev;
            // Also check if any plan was created within the last 30 seconds (prevents rapid duplicates)
            const thirtySecondsAgo = Date.now() - 30000;
            const hasRecentDuplicate = prev.some(p => {
              const planTime = new Date(p.createdAt).getTime();
              return planTime > thirtySecondsAgo &&
                     p.answers?.goal === answers.goal &&
                     dietToString(p.answers?.diet) === dietToString(answers.diet);
            });
            if (hasRecentDuplicate) {
              console.log("⚠️ Skipping duplicate plan creation (created within 30s)");
              return prev;
            }
            return [...prev, { plan: result, answers: { ...answers }, createdAt: now, label: "Plan " + (prev.length + 1) + ": " + answers.goal + " (" + dietToString(answers.diet) + ")" }];
          });
          // Insert to DB only if not already inserted (track via ref)
          if (user?.leadId && !insertedTimestamps.current.has(now)) {
            insertedTimestamps.current.add(now);
            sbInsert("plans", { lead_id: user.leadId, meal_plan: result.meal_plan, workout_plan: result.workout_plan, grocery_list: result.grocery_list });
          }
          setScreen("preview");
        }, 500);
      }
    }, 40);
  };

  const onBack = () => { if (step > 0) setStep(s => s - 1); else setScreen("email"); };

  const onRegen = () => {
    if (!isPaid && genCount >= MAX_FREE_GENS) { setScreen("limit"); return; }
    if (isPaid && genCount >= MAX_PAID_GENS) {
      alert("You've used all 10 plan generations for this 28-day cycle. You can still view your existing plans! When your access expires, unlock again to get 10 more generations.");
      return;
    }
    setStep(0); setPlan(null); setProgress(0); setScreen("quiz");
  };

  const switchPlan = (idx) => {
    const h = planHistory[idx];
    if (h) { setPlan(h.plan); setAnswers(h.answers); }
  };

  // Generate a specific week on-demand (Week 2, 3, or 4 for paid users)
  const [weekGenerating, setWeekGenerating] = useState(null); // null or 1/2/3/4
  const generateWeek = async (weekNum) => {
    if (!isPaid || !plan || weekGenerating) return;
    setWeekGenerating(weekNum);
    console.log("🗓️ Generating Week " + weekNum + " on-demand...");

    try {
      const weekResult = await aiGenerate(answers, true, weekNum);
      if (weekResult && weekResult.meal_plan) {
        // Merge the new week into the existing plan
        const updatedPlan = {
          meal_plan: [...(plan.meal_plan || []), ...weekResult.meal_plan],
          workout_plan: [...(plan.workout_plan || []), ...(weekResult.workout_plan || [])],
          // Merge grocery lists (combine items per category)
          grocery_list: mergeGroceryLists(plan.grocery_list || [], weekResult.grocery_list || [])
        };
        setPlan(updatedPlan);

        // Update DB
        if (user?.leadId) {
          // Find the most recent plan in DB and update it
          const allPlans = await sbFindAll("plans", "lead_id", user.leadId);
          if (allPlans.length > 0) {
            const latestPlanId = allPlans[0].id;
            await sbUpdate("plans", latestPlanId, {
              meal_plan: updatedPlan.meal_plan,
              workout_plan: updatedPlan.workout_plan,
              grocery_list: updatedPlan.grocery_list
            });
          }
        }
        console.log("✅ Week " + weekNum + " added!");
      } else {
        console.warn("⚠️ Week " + weekNum + " generation failed");
        alert("Couldn't generate Week " + weekNum + " right now. Please try again in a moment.");
      }
    } catch(e) {
      console.warn("Week generation error:", e);
      alert("Couldn't generate Week " + weekNum + " right now. Please try again in a moment.");
    } finally {
      setWeekGenerating(null);
    }
  };

  // Delete a saved plan
  const deletePlan = async (planIdx) => {
    const h = planHistory[planIdx];
    if (!h || !user?.leadId) return;

    // Block deletion of most recent (last in array = newest)
    if (planIdx === planHistory.length - 1) {
      alert("Your most recent plan can't be deleted. Generate a new plan first to make this one older, then delete it.");
      return;
    }

    if (!confirm("Delete this saved plan? This can't be undone.")) return;

    try {
      // Find DB plan by created_at
      const allPlans = await sbFindAll("plans", "lead_id", user.leadId);
      const dbPlan = allPlans.find(p => p.created_at === h.createdAt);

      if (dbPlan) {
        const r = await fetch(`${SB_URL}/rest/v1/plans?id=eq.${dbPlan.id}`, {
          method: "DELETE",
          headers: { ...sbHeaders, "Prefer": "return=minimal" }
        });
        if (!r.ok) {
          console.warn("Delete failed with status:", r.status, await r.text());
          alert("Couldn't delete this plan due to a server error. Please try again or contact support.");
          return;
        }
      }
      // Update UI
      const newHistory = planHistory.filter((_, i) => i !== planIdx);
      setPlanHistory(newHistory);
    } catch(e) {
      console.warn("Delete failed:", e);
      alert("Couldn't delete the plan. Try again.");
    }
  };

  // Clear all older plans (keep only most recent)
  const onClearOldPlans = async () => {
    if (planHistory.length <= 1 || !user?.leadId) return;
    const olderCount = planHistory.length - 1;
    if (!confirm(`Delete all ${olderCount} older plans? Your most recent plan will be kept. This can't be undone.`)) return;

    try {
      const allPlans = await sbFindAll("plans", "lead_id", user.leadId);
      console.log(`🗑️ Found ${allPlans.length} plans in DB, attempting to delete ${allPlans.length - 1}`);

      // Sort by created_at desc — newest first
      const sortedByDate = [...allPlans].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const toDelete = sortedByDate.slice(1);

      // Delete each plan and verify response
      let successCount = 0;
      let failCount = 0;
      for (const p of toDelete) {
        try {
          const r = await fetch(`${SB_URL}/rest/v1/plans?id=eq.${p.id}`, {
            method: "DELETE",
            headers: { ...sbHeaders, "Prefer": "return=minimal" }
          });
          if (r.ok) {
            successCount++;
          } else {
            failCount++;
            console.warn(`Failed to delete plan ${p.id}: ${r.status}`, await r.text());
          }
        } catch(err) {
          failCount++;
          console.warn(`Delete error for ${p.id}:`, err);
        }
      }

      console.log(`✅ Deleted ${successCount}, ❌ Failed ${failCount}`);

      // Re-fetch to verify what's actually in DB now
      const remaining = await sbFindAll("plans", "lead_id", user.leadId);
      console.log(`📊 Plans remaining in DB: ${remaining.length}`);

      if (remaining.length > 1) {
        // Some deletes failed — show warning
        alert(`Deleted ${successCount} plans, but ${remaining.length - 1} could not be removed. This may be due to database security settings. Please contact support if this continues.`);
      }

      // Rebuild local history from what's actually in DB
      const newHistory = remaining.map((p, i) => ({
        plan: { meal_plan: p.meal_plan, workout_plan: p.workout_plan, grocery_list: p.grocery_list },
        answers: { goal: answers.goal, diet: answers.diet, fitness: answers.fitness, time: answers.time, focus: answers.focus, cuisine: answers.cuisine },
        createdAt: p.created_at,
        label: "Plan " + (i + 1)
      }));
      setPlanHistory(newHistory);
    } catch(e) {
      console.warn("Bulk delete failed:", e);
      alert("Couldn't clear old plans. Try again.");
    }
  };

  const onUpgrade = () => {
    // Save session before leaving so we can restore after Stripe redirect
    if (user) saveSession({ email: user.email, name: user.name, leadId: user.leadId, isPaid: false });
    window.open(STRIPE_LINK, "_blank");
  };

  // Generate beautiful branded PDF — opens new window with formatted plan, triggers print dialog
  // User can then "Save as PDF" from the browser print menu
  const generatePDF = () => {
    if (!plan?.meal_plan || !isPaid) return;

    const userName = user?.name || "Friend";
    const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const dietStr = dietToString(answers.diet) || "Balanced";
    const cuisineStr = (Array.isArray(answers.cuisine) ? answers.cuisine.join(", ") : answers.cuisine) || "Mixed";
    const totalDays = plan.meal_plan.length;
    const planType = totalDays >= 14 ? `${totalDays}-Day` : `${totalDays}-Day`;

    // Build the meals HTML
    const mealsHTML = plan.meal_plan.map((day, idx) => {
      const dayNum = idx + 1;
      const week = Math.ceil(dayNum / 7);
      const totalCal = (day.meals || []).reduce((s, m) => s + (m.cal || 0), 0);
      const mealsList = (day.meals || []).map(m => `
        <div class="meal-card">
          <div class="meal-header">
            <span class="meal-emoji">${m.emoji || '🍽️'}</span>
            <div class="meal-info">
              <div class="meal-time">${m.time || 'Meal'}</div>
              <div class="meal-name">${m.name || ''}</div>
            </div>
            <div class="meal-cal">${m.cal || 0} cal</div>
          </div>
          <div class="meal-macros">
            <span>P: ${m.protein || '—'}</span>
            <span>C: ${m.carbs || '—'}</span>
            <span>F: ${m.fat || '—'}</span>
            <span>⏱ ${m.prep_time || '—'}</span>
          </div>
          ${m.desc ? `<div class="meal-desc">${m.desc}</div>` : ''}
          ${(m.ingredients||[]).length > 0 ? `
            <div class="ingredients">
              <div class="section-label">Ingredients</div>
              <ul>${m.ingredients.map(i => `<li>${i}</li>`).join('')}</ul>
            </div>` : ''}
          ${(m.instructions||[]).length > 0 ? `
            <div class="instructions">
              <div class="section-label">Instructions</div>
              <ol>${m.instructions.map(i => `<li>${i}</li>`).join('')}</ol>
            </div>` : ''}
        </div>
      `).join('');

      return `
        <div class="day-section">
          <div class="day-header">
            <div>
              <div class="day-num">Day ${dayNum} ${totalDays > 7 ? `· Week ${week}` : ''}</div>
              <div class="day-title">${day.day || ''}</div>
            </div>
            <div class="day-cal">${totalCal} cal total</div>
          </div>
          ${mealsList}
        </div>
      `;
    }).join('');

    // Build workouts HTML
    const workoutsHTML = (plan.workout_plan || []).map((w, idx) => {
      const dayNum = idx + 1;
      const week = Math.ceil(dayNum / 7);
      const exercisesList = (w.exercises || []).map((ex, i) => {
        const exObj = typeof ex === 'string' ? { name: ex } : ex;
        return `
          <div class="exercise-row">
            <span class="ex-num">${i + 1}</span>
            <div class="ex-info">
              <div class="ex-name">${exObj.name || ''}</div>
              ${exObj.modification ? `<div class="ex-mod">🪑 Easier: ${exObj.modification}</div>` : ''}
            </div>
            ${exObj.detail ? `<span class="ex-detail">${exObj.detail}</span>` : ''}
          </div>
        `;
      }).join('');

      return `
        <div class="workout-card">
          <div class="workout-header">
            <span class="workout-icon">${w.icon || '💪'}</span>
            <div>
              <div class="workout-day">Day ${dayNum} ${totalDays > 7 ? `· Week ${week}` : ''}</div>
              <div class="workout-name">${w.name || ''} · ${w.duration || ''}</div>
            </div>
          </div>
          ${exercisesList}
        </div>
      `;
    }).join('');

    // Build grocery HTML
    const groceryHTML = (plan.grocery_list || []).map(cat => `
      <div class="grocery-cat">
        <h3>${cat.category || ''}</h3>
        <ul>${(cat.items || []).map(item => `<li>☐ ${item}</li>`).join('')}</ul>
      </div>
    `).join('');

    // Full HTML document with cream/blush brand styling
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Nourish You — ${userName}'s ${planType} Plan</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'DM Sans', sans-serif;
    background: #FBF7F4;
    color: #2D2A2E;
    line-height: 1.6;
    padding: 40px 50px;
  }
  h1, h2, h3 { font-family: 'Playfair Display', serif; color: #2D2A2E; }

  /* Cover Page */
  .cover {
    min-height: 90vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    background: linear-gradient(160deg, #FBF7F4, #FCE4DC, #F8D7C8);
    border-radius: 20px;
    padding: 80px 40px;
    page-break-after: always;
    position: relative;
  }
  .cover-logo {
    width: 80px; height: 80px;
    border-radius: 50%;
    background: linear-gradient(135deg, #E8927C, #F2B8A2);
    display: flex; align-items: center; justify-content: center;
    margin-bottom: 24px;
    box-shadow: 0 8px 30px rgba(232,146,124,0.3);
  }
  .cover-logo span { color: white; font-family: 'Playfair Display', serif; font-size: 40px; font-weight: 700; }
  .cover h1 { font-size: 48px; margin-bottom: 8px; letter-spacing: 0.02em; }
  .cover .brand { font-family: 'DM Sans'; color: #E8927C; font-size: 13px; font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; margin-bottom: 40px; }
  .cover .tagline { font-family: 'Playfair Display', serif; font-style: italic; font-size: 22px; color: #5A5458; max-width: 500px; margin-bottom: 50px; }
  .cover .name-card { background: white; padding: 30px 50px; border-radius: 14px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); margin-bottom: 30px; }
  .cover .for-label { font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #948B90; margin-bottom: 8px; font-weight: 600; }
  .cover .for-name { font-family: 'Playfair Display', serif; font-size: 32px; font-weight: 600; color: #2D2A2E; }
  .cover .meta { display: flex; gap: 40px; justify-content: center; margin-top: 30px; }
  .cover .meta-item { text-align: center; }
  .cover .meta-label { font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; color: #948B90; margin-bottom: 4px; font-weight: 600; }
  .cover .meta-value { font-size: 13px; font-weight: 600; color: #2D2A2E; }
  .cover .date { margin-top: 40px; font-size: 11px; color: #948B90; }

  /* Section Headers */
  .section-divider {
    page-break-before: always;
    text-align: center;
    padding: 80px 0 40px;
  }
  .section-divider .section-emoji { font-size: 48px; margin-bottom: 16px; }
  .section-divider h2 { font-size: 36px; margin-bottom: 8px; }
  .section-divider .subtitle { font-size: 14px; color: #948B90; }

  /* Day Section */
  .day-section {
    background: white;
    border-radius: 14px;
    padding: 24px;
    margin-bottom: 20px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.04);
    page-break-inside: avoid;
  }
  .day-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 14px;
    border-bottom: 2px solid #FCE4DC;
    margin-bottom: 16px;
  }
  .day-num { font-size: 11px; color: #E8927C; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
  .day-title { font-family: 'Playfair Display', serif; font-size: 22px; font-weight: 600; margin-top: 2px; }
  .day-cal { font-size: 12px; font-weight: 600; color: #5A5458; background: #FBF7F4; padding: 6px 12px; border-radius: 14px; }

  /* Meal Card */
  .meal-card {
    background: #FBF7F4;
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 12px;
    border-left: 3px solid #E8927C;
  }
  .meal-header { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 10px; }
  .meal-emoji { font-size: 28px; line-height: 1; }
  .meal-info { flex: 1; }
  .meal-time { font-size: 10px; font-weight: 700; color: #E8927C; letter-spacing: 0.1em; text-transform: uppercase; }
  .meal-name { font-family: 'Playfair Display', serif; font-size: 16px; font-weight: 600; margin-top: 2px; }
  .meal-cal { font-size: 12px; font-weight: 600; color: #5A5458; }
  .meal-macros { display: flex; gap: 12px; flex-wrap: wrap; font-size: 11px; color: #5A5458; padding: 6px 0; border-top: 1px dashed #FCE4DC; border-bottom: 1px dashed #FCE4DC; margin-bottom: 10px; }
  .meal-macros span { font-weight: 500; }
  .meal-desc { font-size: 12px; color: #5A5458; font-style: italic; margin-bottom: 10px; }
  .section-label { font-size: 10px; font-weight: 700; color: #E8927C; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 5px; }
  .ingredients ul, .instructions ol { padding-left: 20px; margin-bottom: 10px; }
  .ingredients li, .instructions li { font-size: 12px; color: #2D2A2E; margin-bottom: 3px; }

  /* Workout Card */
  .workout-card {
    background: white;
    border-radius: 14px;
    padding: 20px;
    margin-bottom: 16px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.04);
    border-left: 4px solid #B8D4C2;
    page-break-inside: avoid;
  }
  .workout-header { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px dashed #E0DCD9; }
  .workout-icon { font-size: 28px; }
  .workout-day { font-size: 11px; color: #B8D4C2; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
  .workout-name { font-family: 'Playfair Display', serif; font-size: 18px; font-weight: 600; margin-top: 2px; }
  .exercise-row { display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; border-bottom: 1px solid #FBF7F4; }
  .exercise-row:last-child { border-bottom: none; }
  .ex-num { background: #B8D4C2; color: white; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; }
  .ex-info { flex: 1; }
  .ex-name { font-size: 13px; font-weight: 600; color: #2D2A2E; }
  .ex-mod { font-size: 11px; color: #5A5458; font-style: italic; margin-top: 3px; }
  .ex-detail { font-size: 11px; color: #948B90; font-weight: 600; flex-shrink: 0; }

  /* Grocery */
  .grocery-cat {
    background: white;
    border-radius: 12px;
    padding: 18px 22px;
    margin-bottom: 14px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.04);
    page-break-inside: avoid;
  }
  .grocery-cat h3 { font-size: 16px; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px dashed #FCE4DC; }
  .grocery-cat ul { list-style: none; padding: 0; columns: 2; column-gap: 30px; }
  .grocery-cat li { font-size: 12px; color: #2D2A2E; padding: 4px 0; break-inside: avoid; }

  /* Safety Disclaimer */
  .disclaimer {
    background: #FCE4DC;
    border-radius: 12px;
    padding: 20px 24px;
    margin: 24px 0;
    border-left: 4px solid #E8927C;
  }
  .disclaimer h3 { font-size: 16px; margin-bottom: 8px; }
  .disclaimer p { font-size: 12px; color: #5A5458; line-height: 1.6; }

  /* Final Page */
  .final-page {
    page-break-before: always;
    text-align: center;
    padding: 60px 40px;
    background: linear-gradient(160deg, #FBF7F4, #FCE4DC);
    border-radius: 20px;
    margin-top: 40px;
  }
  .final-page h2 { font-size: 32px; margin-bottom: 12px; }
  .final-page .stay-tag { font-family: 'DM Sans'; color: #E8927C; font-size: 11px; font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; margin-bottom: 30px; }
  .final-page p { font-size: 14px; color: #5A5458; max-width: 480px; margin: 0 auto 30px; line-height: 1.7; }
  .links-grid { display: flex; flex-direction: column; gap: 12px; max-width: 380px; margin: 0 auto 30px; }
  .link-card { background: white; padding: 14px 20px; border-radius: 12px; display: flex; align-items: center; gap: 14px; box-shadow: 0 2px 10px rgba(0,0,0,0.04); }
  .link-icon { font-size: 24px; }
  .link-info { flex: 1; text-align: left; }
  .link-label { font-size: 10px; color: #948B90; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; }
  .link-value { font-size: 14px; font-weight: 600; color: #2D2A2E; }
  .signature { font-family: 'Playfair Display', serif; font-style: italic; font-size: 18px; color: #5A5458; margin-top: 30px; }

  /* Footer (every page) */
  .footer-line {
    text-align: center;
    margin-top: 30px;
    padding-top: 20px;
    border-top: 1px solid #FCE4DC;
    font-size: 10px;
    color: #948B90;
    letter-spacing: 0.05em;
  }
  .footer-line span { margin: 0 8px; }
  .footer-line a { color: #E8927C; text-decoration: none; }

  /* Print rules */
  @media print {
    body { padding: 20px; background: white; }
    .day-section, .workout-card, .grocery-cat { page-break-inside: avoid; }
    .cover { min-height: 95vh; }
    .print-button { display: none !important; }
  }

  /* Action button bar (only visible on screen) */
  .action-bar {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 10px;
    z-index: 1000;
  }
  .action-btn {
    border: none;
    padding: 13px 22px;
    border-radius: 30px;
    font-family: 'DM Sans', sans-serif;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 6px 24px rgba(0,0,0,0.15);
    transition: all 0.2s;
  }
  .action-btn.primary {
    background: linear-gradient(135deg, #E8927C, #F2B8A2);
    color: white;
  }
  .action-btn.secondary {
    background: white;
    color: #2D2A2E;
    border: 1px solid #FCE4DC;
  }
  .action-btn:hover { transform: translateY(-2px); }
</style>
</head>
<body>

<!-- Action Bar (fixed at bottom — Close + Save as PDF) -->
<div class="action-bar">
  <button class="action-btn secondary" onclick="window.close(); setTimeout(()=>{if(!window.closed){window.history.back();}}, 100);">← Back to App</button>
  <button class="action-btn primary" onclick="window.print()">📄 Save as PDF</button>
</div>

<!-- Top banner with instructions -->
<div style="position:fixed;top:0;left:0;right:0;background:#2D2A2E;color:white;padding:10px 20px;text-align:center;font-family:'DM Sans',sans-serif;font-size:12px;z-index:999;display:flex;align-items:center;justify-content:center;gap:8px;" class="top-banner">
  <span>📱 Tap <strong>Save as PDF</strong> to download. Or close this tab to return to the app.</span>
</div>
<style>@media print { .top-banner { display: none !important; } } body { padding-top: 60px !important; }</style>

<!-- Cover Page -->
<div class="cover">
  <div class="cover-logo"><span>N</span></div>
  <h1>Nourish You</h1>
  <div class="brand">by FitWithHiral</div>
  <div class="tagline">Nourish your body, transform your life</div>
  <div class="name-card">
    <div class="for-label">Crafted for</div>
    <div class="for-name">${userName}</div>
  </div>
  <div class="meta">
    <div class="meta-item">
      <div class="meta-label">Plan Type</div>
      <div class="meta-value">${planType}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Goal</div>
      <div class="meta-value">${answers.goal || '—'}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Diet</div>
      <div class="meta-value">${dietStr}</div>
    </div>
  </div>
  <div class="date">Generated ${today}</div>
</div>

<!-- Meals Section -->
<div class="section-divider">
  <div class="section-emoji">🥗</div>
  <h2>Your Meal Plan</h2>
  <div class="subtitle">${totalDays} days of nourishment, customized for you</div>
</div>
${mealsHTML}
<div class="footer-line">
  <span>fitwithhiral.com</span>·<span>@fitwithhiral</span>·<span>app.fitwithhiral.com</span>
</div>

<!-- Workouts Section -->
${(plan.workout_plan || []).length > 0 ? `
  <div class="section-divider">
    <div class="section-emoji">💪</div>
    <h2>Your Workout Plan</h2>
    <div class="subtitle">Movement made for ${answers.fitness?.toLowerCase() || 'you'}</div>
  </div>
  <div class="disclaimer">
    <h3>🛡️ Workout Safety</h3>
    <p>Listen to your body. If any movement causes pain, stop and try the easier modification noted with each exercise. Talk to your doctor before starting if you have joint, back, or heart concerns. This is fitness guidance, not medical advice.</p>
  </div>
  ${workoutsHTML}
  <div class="footer-line">
    <span>fitwithhiral.com</span>·<span>@fitwithhiral</span>·<span>app.fitwithhiral.com</span>
  </div>
` : ''}

<!-- Grocery Section -->
${(plan.grocery_list || []).length > 0 ? `
  <div class="section-divider">
    <div class="section-emoji">🛒</div>
    <h2>Your Grocery List</h2>
    <div class="subtitle">Everything you need, organized by category</div>
  </div>
  ${groceryHTML}
  <div class="footer-line">
    <span>fitwithhiral.com</span>·<span>@fitwithhiral</span>·<span>app.fitwithhiral.com</span>
  </div>
` : ''}

<!-- Final Page: Stay Connected -->
<div class="final-page">
  <h2>Stay Connected</h2>
  <div class="stay-tag">Your Wellness Journey</div>
  <p>You've got everything you need to start. Remember — small daily choices compound into massive transformations. I'm cheering for you every step of the way.</p>
  <div class="links-grid">
    <div class="link-card">
      <span class="link-icon">📱</span>
      <div class="link-info">
        <div class="link-label">App</div>
        <div class="link-value">app.fitwithhiral.com</div>
      </div>
    </div>
    <div class="link-card">
      <span class="link-icon">🌐</span>
      <div class="link-info">
        <div class="link-label">Website</div>
        <div class="link-value">fitwithhiral.com</div>
      </div>
    </div>
    <div class="link-card">
      <span class="link-icon">📸</span>
      <div class="link-info">
        <div class="link-label">Instagram</div>
        <div class="link-value">@fitwithhiral</div>
      </div>
    </div>
  </div>
  <div class="signature">— With love, Hiral 🌸</div>
</div>

</body>
</html>`;

    // Open in new window and let user print/save as PDF
    const w = window.open("", "_blank");
    if (!w) {
      alert("Please allow pop-ups to download your PDF, then try again.");
      return;
    }
    w.document.write(html);
    w.document.close();
    // Don't auto-print — let user review the PDF and click the button when ready
    setTimeout(() => { try { w.focus(); } catch(e) {} }, 300);
  };

  const reset = () => {
    clearSession();
    setScreen("welcome"); setStep(0); setAnswers({}); setUser(null); setPlan(null); setProgress(0); setGenCount(0); setIsPaid(false); setPlanHistory([]); setExpired(false);
  };

  // "Back to Home" from settings — keeps user logged in, goes to home tab
  const backToHome = () => {
    setScreen("dashboard");
  };

  const signupDifferent = () => {
    clearSession();
    setStep(0); setAnswers({}); setUser(null); setPlan(null); setProgress(0); setGenCount(0); setIsPaid(false); setPlanHistory([]); setExpired(false);
    setScreen("email");
  };

  // If expired, show limit screen
  if (expired && !isPaid && screen === "dashboard") {
    return <div style={{ maxWidth: 480, margin: "0 auto", background: C.bg, minHeight: "100vh" }}>
      <style>{CSS}</style>
      <LimitScreen genCount={genCount} onUpgrade={onUpgrade} onHome={reset} expired={true} user={user} onSignupDifferent={signupDifferent} />
    </div>;
  }

  return <div style={{ maxWidth: 480, margin: "0 auto", background: C.bg, minHeight: "100vh", position: "relative", overflow: "hidden" }}>
    <style>{CSS}</style>
    {screen === "welcome" && <WelcomeScreen onStart={() => setScreen("email")} />}
    {screen === "email" && <EmailScreen onSubmit={onEmail} onLogin={onLogin} />}
    {screen === "quiz" && <QuizScreen step={step} answers={answers} onAnswer={onAnswer} onBack={onBack} onNext={onNext} />}
    {screen === "loading" && <LoadingScreen progress={progress} isPaid={isPaid} />}
    {screen === "preview" && <PreviewScreen plan={plan} answers={answers} user={user} isPaid={isPaid} onUnlock={() => setScreen("dashboard")} />}
    {screen === "payment-success" && <PaymentSuccessScreen user={user} onContinue={() => setScreen("dashboard")} />}
    {screen === "limit" && <LimitScreen genCount={genCount} onUpgrade={onUpgrade} onHome={reset} expired={expired} user={user} onSignupDifferent={signupDifferent} />}
    {screen === "dashboard" && <DashScreen plan={plan} answers={answers} user={user} onRegen={onRegen} onReset={reset} isPaid={isPaid} genCount={genCount} onUpgrade={onUpgrade} planHistory={planHistory} switchPlan={switchPlan} planCreatedAt={planCreatedAt} generateWeek={generateWeek} weekGenerating={weekGenerating} deletePlan={deletePlan} onClearOldPlans={onClearOldPlans} generatePDF={generatePDF} />}
    {showA2HS && screen === "dashboard" && <AddToHomePrompt onDismiss={() => setShowA2HS(false)} />}
  </div>;
}
