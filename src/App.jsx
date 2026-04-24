import { useState, useEffect } from "react";

// ─── CONFIG ───
const SB_URL = "https://fimsmaafruzbpoibepua.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpbXNtYWFmcnV6YnBvaWJlcHVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNTcyNDUsImV4cCI6MjA5MTgzMzI0NX0.K6RZY9nb8NEcB9yFP4KJXlHyamXa5pFuPA-cmfbnQbI";
const STRIPE_LINK = "https://buy.stripe.com/bJe3cvaiy2atd6LfZv38402";
const INSTAGRAM_LINK = "https://www.instagram.com/fitwithhiral/";
const MAX_FREE_GENS = 3;
const FREE_ACCESS_DAYS = 7;

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
    const r = await fetch(`${SB_URL}/rest/v1/${t}?${col}=eq.${encodeURIComponent(val)}&limit=1`, { headers:sbHeaders });
    const j = await r.json(); return j?.[0] || null;
  } catch { return null; }
}

// ─── AI PLAN GENERATION ───
async function aiGenerate(answers) {
  const p = `You are a certified fitness coach. Create a 7-day ${answers.diet} meal + workout plan.
Goal: ${answers.goal} | Fitness: ${answers.fitness} | Cook time: ${answers.time} | Focus: ${(answers.focus||[]).join(", ")}
Return ONLY JSON: {"meal_plan":[{"day":"Monday","meals":[{"time":"Breakfast","name":"Name","emoji":"🥣","cal":380,"protein":"24g","carbs":"42g","fat":"14g","prep_time":"15 min","desc":"Brief desc","ingredients":["item1","item2"],"instructions":["Step 1","Step 2"]}]}],"workout_plan":[{"day":"Monday","name":"Name","icon":"🦵","duration":"30 min","exercises":[{"name":"Exercise","detail":"3×12"}]}],"grocery_list":[{"category":"🥬 Produce","items":["item1","item2"]}]}
Rules: 4 meals/day. ${answers.diet} only. ${(answers.focus||[]).includes("Authentic Gujarati Flavours")?"Include Gujarati dishes (dhokla,thepla,undhiyu,dal dhokli,handvo).":""} High protein. 3-6 ingredients, 3-5 steps per recipe. ${answers.fitness} workouts with 1-2 rest days.`;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 7000, messages: [{ role: "user", content: p }] })
    });
    const d = await r.json();
    const txt = d.content?.map(function(b) { return b.text || ""; }).join("") || "";
    const parsed = JSON.parse(txt.replace(/```json|```/g, "").trim());
    if (parsed && parsed.meal_plan && parsed.meal_plan.length >= 7) return parsed;
    return null;
  } catch(e) { console.warn("AI gen failed:", e.message); return null; }
}

// ─── FALLBACK PLAN ───
function makeFallback(a) {
  const diet = a.diet || "Lacto-Ovo Vegetarian";
  const guj = (a.focus||[]).includes("Authentic Gujarati Flavours");
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
  const meal_plan = dayNames.map((d,i) => ({ day:d, meals:t[i%t.length].map(m=>({...m})) }));

  const workouts = {
    Beginner: [
      {day:"Monday",name:"Lower Body Basics",icon:"🦵",duration:"25 min",exercises:[{name:"Bodyweight Squats",detail:"3×12"},{name:"Lunges",detail:"3×10 each"},{name:"Glute Bridges",detail:"3×15"},{name:"Calf Raises",detail:"3×15"}]},
      {day:"Tuesday",name:"Upper Body + Core",icon:"💪",duration:"25 min",exercises:[{name:"Wall Push-ups",detail:"3×10"},{name:"Dumbbell Rows",detail:"3×10"},{name:"Shoulder Press",detail:"3×10"},{name:"Plank Hold",detail:"3×30s"}]},
      {day:"Wednesday",name:"Active Recovery",icon:"🧘",duration:"20 min",exercises:[{name:"Gentle Yoga Flow",detail:"15 min"},{name:"Foam Rolling",detail:"5 min"}]},
      {day:"Thursday",name:"Full Body Circuit",icon:"⚡",duration:"25 min",exercises:[{name:"Jumping Jacks",detail:"3×20"},{name:"Squats",detail:"3×12"},{name:"Push-ups",detail:"3×8"},{name:"Mountain Climbers",detail:"3×15"}]},
      {day:"Friday",name:"Glutes & Legs",icon:"🍑",duration:"25 min",exercises:[{name:"Sumo Squats",detail:"3×15"},{name:"Step-ups",detail:"3×10"},{name:"Donkey Kicks",detail:"3×12 each"},{name:"Hip Thrusts",detail:"3×15"}]},
      {day:"Saturday",name:"Cardio + Core",icon:"🏃",duration:"25 min",exercises:[{name:"Brisk Walk",detail:"15 min"},{name:"Bicycle Crunches",detail:"3×15"},{name:"Leg Raises",detail:"3×10"}]},
      {day:"Sunday",name:"Rest & Restore",icon:"😴",duration:"—",exercises:[{name:"Full rest day",detail:""},{name:"Stretching optional",detail:""},{name:"Meal prep",detail:""}]},
    ],
    Intermediate: [
      {day:"Monday",name:"Lower Body Strength",icon:"🦵",duration:"35 min",exercises:[{name:"Goblet Squats",detail:"4×12"},{name:"Romanian Deadlifts",detail:"3×12"},{name:"Walking Lunges",detail:"3×10 each"},{name:"Hip Thrusts",detail:"4×15"}]},
      {day:"Tuesday",name:"Upper Push/Pull",icon:"💪",duration:"30 min",exercises:[{name:"Push-ups",detail:"4×12"},{name:"Dumbbell Rows",detail:"4×12"},{name:"Shoulder Press",detail:"3×10"},{name:"Plank",detail:"3×45s"}]},
      {day:"Wednesday",name:"HIIT + Core",icon:"⚡",duration:"25 min",exercises:[{name:"Burpees",detail:"4×8"},{name:"Mountain Climbers",detail:"4×20"},{name:"Russian Twists",detail:"3×20"},{name:"Bicycle Crunches",detail:"3×20"}]},
      {day:"Thursday",name:"Active Recovery",icon:"🧘",duration:"25 min",exercises:[{name:"Yoga Flow",detail:"20 min"},{name:"Foam Rolling",detail:"5 min"}]},
      {day:"Friday",name:"Glute Focused",icon:"🍑",duration:"35 min",exercises:[{name:"Sumo Deadlifts",detail:"4×12"},{name:"Bulgarian Splits",detail:"3×10 each"},{name:"Cable Kickbacks",detail:"3×12"},{name:"Leg Press",detail:"3×15"}]},
      {day:"Saturday",name:"Cardio + Abs",icon:"🏃",duration:"30 min",exercises:[{name:"Incline Walk",detail:"20 min"},{name:"Hanging Leg Raises",detail:"3×12"},{name:"Plank Variations",detail:"3×45s"}]},
      {day:"Sunday",name:"Rest Day",icon:"😴",duration:"—",exercises:[{name:"Complete rest",detail:""},{name:"Meal prep",detail:""}]},
    ],
    Advanced: [
      {day:"Monday",name:"Heavy Lower Body",icon:"🦵",duration:"45 min",exercises:[{name:"Barbell Squats",detail:"5×5"},{name:"Romanian Deadlifts",detail:"4×10"},{name:"Walking Lunges (weighted)",detail:"3×12 each"},{name:"Calf Raises",detail:"4×20"}]},
      {day:"Tuesday",name:"Upper Power",icon:"💪",duration:"40 min",exercises:[{name:"Bench Press",detail:"5×8"},{name:"Bent Over Rows",detail:"4×10"},{name:"OHP",detail:"4×8"},{name:"Pull-ups",detail:"3×max"}]},
      {day:"Wednesday",name:"HIIT Conditioning",icon:"⚡",duration:"30 min",exercises:[{name:"Box Jumps",detail:"4×10"},{name:"Burpees",detail:"4×12"},{name:"Kettlebell Swings",detail:"4×15"},{name:"Battle Ropes",detail:"4×30s"}]},
      {day:"Thursday",name:"Active Recovery",icon:"🧘",duration:"30 min",exercises:[{name:"Yoga / Mobility",detail:"25 min"},{name:"Foam Rolling",detail:"5 min"}]},
      {day:"Friday",name:"Glute Hypertrophy",icon:"🍑",duration:"40 min",exercises:[{name:"Hip Thrusts (heavy)",detail:"5×10"},{name:"Sumo Squats",detail:"4×12"},{name:"Single-Leg RDL",detail:"3×10 each"},{name:"Cable Kickbacks",detail:"3×15"}]},
      {day:"Saturday",name:"Full Body + Cardio",icon:"🏃",duration:"40 min",exercises:[{name:"Deadlifts",detail:"4×6"},{name:"Push Press",detail:"4×8"},{name:"Farmer's Walk",detail:"3×40m"},{name:"Stairmaster",detail:"15 min"}]},
      {day:"Sunday",name:"Rest & Recharge",icon:"😴",duration:"—",exercises:[{name:"Full rest",detail:""},{name:"Light walk optional",detail:""}]},
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

  return { meal_plan, workout_plan: workouts[a.fitness] || workouts.Beginner, grocery_list };
}

// ─── QUIZ DATA ───
const QUIZ = [
  {id:"goal",q:"What's your primary wellness goal?",sub:"We'll personalize everything around this",opts:[{l:"Lose Weight",e:"🔥",d:"Sustainable fat loss"},{l:"Build Strength",e:"💪",d:"Tone & define"},{l:"Balance Hormones",e:"🌸",d:"Cycle & cortisol support"},{l:"Improve Digestion",e:"🌿",d:"Gut health reset"}]},
  {id:"diet",q:"What's your dietary preference?",sub:"So we nail every recipe for you",opts:[{l:"Lacto-Vegetarian",e:"🥛",d:"Dairy, no eggs"},{l:"Lacto-Ovo Vegetarian",e:"🧀",d:"Dairy & eggs"},{l:"Vegan",e:"🌱",d:"Fully plant-based"},{l:"Pescatarian",e:"🐟",d:"Vegetarian + seafood"},{l:"Non-Vegetarian",e:"🍗",d:"Includes all proteins"}]},
  {id:"fitness",q:"What's your current fitness level?",sub:"No judgment — just finding your starting point",opts:[{l:"Beginner",e:"🌱",d:"Just getting started"},{l:"Intermediate",e:"⚡",d:"Somewhat active"},{l:"Advanced",e:"🏋️",d:"Regular training"}]},
  {id:"time",q:"How much time can you cook each day?",sub:"We'll match recipes to your schedule",opts:[{l:"15-20 min",e:"⏱️",d:"Quick & easy"},{l:"30-40 min",e:"🍳",d:"Moderate prep"},{l:"45-60 min",e:"👩‍🍳",d:"Love cooking!"}]},
  {id:"focus",q:"Any special focus areas?",sub:"Select all that apply",multi:true,opts:[{l:"High Protein",e:"💪"},{l:"Anti-Inflammatory",e:"🌿"},{l:"Low Carb",e:"🥗"},{l:"Iron-Rich",e:"🫘"},{l:"Gut-Friendly",e:"🦠"},{l:"Hormone Support",e:"🌸"},{l:"Authentic Gujarati Flavours",e:"🇮🇳"}]},
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
function Logo({s="md"}){const z=s==="sm"?16:s==="lg"?28:20; return <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:z,height:z,borderRadius:"50%",background:`linear-gradient(135deg,${C.coral},${C.peach})`,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{color:"#fff",fontSize:z*.5,fontWeight:700,fontFamily:pf}}>N</span></div><span style={{fontFamily:pf,fontSize:z*.85,fontWeight:600,color:C.dk,letterSpacing:"0.02em"}}>Nourish Her</span></div>}
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
    <span style={{fontFamily:dm,fontSize:10,color:C.gr,fontWeight:600}}>{count.toLocaleString()} women started this month</span>
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
  {quote:"Every healthy choice is a vote for the woman you're becoming.",author:"— Hiral",emoji:"🌟",grad:[C.gold,C.coral]},
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
    <Fi delay={200}><h1 style={{fontFamily:pf,fontSize:36,fontWeight:700,color:C.dk,textAlign:"center",letterSpacing:"0.01em"}}>Nourish Her</h1></Fi>
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
    if(mode==="login"){const ex=await sbFind("leads","email",email.trim().toLowerCase());setLoading(false);if(ex){onLogin(ex)}else{setErr("No account found. Try signing up!");setMode("signup")}return}
    if(!name.trim()){setErr("Please enter your name");setLoading(false);return}
    let lid=null;try{const l=await sbInsert("leads",{name:name.trim(),email:email.trim().toLowerCase()});lid=l?.id||null}catch(e){}
    setLoading(false);onSubmit({name:name.trim(),email:email.trim().toLowerCase(),leadId:lid});
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
  const pick=l=>d.multi?onAnswer(d.id,(Array.isArray(sel)?sel:[]).includes(l)?sel.filter(x=>x!==l):[...(sel||[]),l]):onAnswer(d.id,l);
  const ok=d.multi?Array.isArray(sel)&&sel.length>0:!!sel;
  return <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column"}}>
    <div style={{padding:"16px 18px 12px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
      <button onClick={onBack} style={{background:"none",border:"none",fontFamily:dm,fontSize:13,color:C.mt,cursor:"pointer"}}>← Back</button>
      <Logo s="sm"/>
      <span style={{fontFamily:dm,fontSize:12,color:C.mtL}}>{step+1}/{QUIZ.length}</span>
    </div>
    <div style={{display:"flex",gap:4,padding:"0 18px"}}>{QUIZ.map((_,i)=><div key={i} style={{flex:1,height:4,borderRadius:2,background:i<=step?`linear-gradient(90deg,${C.coral},${C.peach})`:C.peachL,transition:"all .4s"}}/>)}</div>
    <div style={{padding:"26px 20px",flex:1}}>
      <Fi key={step} delay={30}><h2 style={{fontFamily:pf,fontSize:24,fontWeight:600,color:C.dk,lineHeight:1.25}}>{d.q}</h2><p style={{fontFamily:dm,fontSize:13,color:C.mtL,margin:"5px 0 22px"}}>{d.sub}</p></Fi>
      <div style={{display:"flex",flexDirection:"column",gap:9}}>
        {d.opts.map((o,i)=>{const on=d.multi?Array.isArray(sel)&&sel.includes(o.l):sel===o.l; return <Fi key={o.l} delay={60+i*40}><button onClick={()=>pick(o.l)} style={{width:"100%",background:C.wh,border:on?`2px solid ${C.coral}`:"2px solid transparent",borderRadius:13,padding:"15px 16px",display:"flex",alignItems:"center",gap:11,cursor:"pointer",boxShadow:on?`0 5px 20px ${C.coral}14`:"0 1px 8px rgba(0,0,0,.03)",transition:"all .25s",textAlign:"left"}}>
          <span style={{fontSize:24,width:36,textAlign:"center"}}>{o.e}</span>
          <div style={{flex:1}}><div style={{fontFamily:dm,fontSize:14,fontWeight:600,color:C.dk}}>{o.l}</div>{o.d&&<div style={{fontFamily:dm,fontSize:11,color:C.mtL,marginTop:1}}>{o.d}</div>}</div>
          {on&&<div style={{width:20,height:20,borderRadius:"50%",background:`linear-gradient(135deg,${C.coral},${C.peach})`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{color:"#fff",fontSize:12}}>✓</span></div>}
        </button></Fi>})}
      </div>
    </div>
    {(d.multi||ok)&&<div style={{padding:"12px 20px 26px"}}><Btn full onClick={onNext} disabled={!ok}>{step===QUIZ.length-1?"Generate My Free Plan ✨":"Continue →"}</Btn></div>}
  </div>;
}

function LoadingScreen({progress}){
  const msgs=["Analyzing your goals...","Crafting personalized recipes...","Building your workout plan...","Creating grocery list...","Finalizing your plan..."];
  const s=Math.min(Math.floor(progress/20),4);
  return <div style={{minHeight:"100vh",background:`linear-gradient(170deg,${C.bg},${C.bgW})`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:32}}>
    <div style={{width:110,height:110,borderRadius:"50%",background:`conic-gradient(${C.coral} ${progress*3.6}deg,${C.peachL} 0deg)`,display:"flex",alignItems:"center",justifyContent:"center",animation:"pulse 2s ease-in-out infinite",marginBottom:28}}>
      <div style={{width:90,height:90,borderRadius:"50%",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontFamily:pf,fontSize:24,fontWeight:700,color:C.coral}}>{Math.round(progress)}%</span></div>
    </div>
    <h2 style={{fontFamily:pf,fontSize:21,fontWeight:600,color:C.dk}}>Creating Your Plan</h2>
    <p style={{fontFamily:dm,fontSize:12,color:C.mtL,marginTop:3}}>Personalizing based on your preferences...</p>
    <div style={{display:"flex",flexDirection:"column",gap:9,marginTop:22,width:"100%",maxWidth:250}}>
      {msgs.map((m,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:9,opacity:i<=s?1:.25,transition:"all .5s"}}>
        <div style={{width:22,height:22,borderRadius:"50%",background:i<s?C.gr:i===s?C.coral:C.peachL,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{color:"#fff",fontSize:10}}>{i<s?"✓":i+1}</span></div>
        <span style={{fontFamily:dm,fontSize:12,color:i<=s?C.dk:C.mtL}}>{m}</span>
      </div>)}
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

      {/* 28-day upsell — only for free users */}
      {!isPaid && <Fi delay={500}><div style={{background:C.wh,borderRadius:16,padding:18,border:`2px solid ${C.coral}18`,boxShadow:`0 3px 16px ${C.coral}06`,marginBottom:16,position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:0,right:0,background:C.coral,color:"#fff",fontFamily:dm,fontSize:8,fontWeight:700,padding:"3px 10px",borderBottomLeftRadius:8,letterSpacing:".04em"}}>MOST POPULAR</div>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8,marginTop:4}}><span style={{fontSize:18}}>⚡</span><h3 style={{fontFamily:pf,fontSize:16,fontWeight:600,color:C.dk}}>Want the full 28-day plan?</h3></div>
        {["4 weeks of unique meal plans","Progressive workout program","Complete monthly grocery lists","Unlimited plan regenerations","Switch between saved plans"].map((f,i)=><div key={i} style={{display:"flex",gap:6,alignItems:"center",padding:"3px 0"}}><span style={{color:C.gr,fontSize:12}}>✓</span><span style={{fontFamily:dm,fontSize:12,color:C.mt}}>{f}</span></div>)}
        <div style={{display:"flex",alignItems:"baseline",gap:6,margin:"12px 0"}}><span style={{fontFamily:dm,fontSize:13,color:C.mtL,textDecoration:"line-through"}}>$29.99 USD</span><span style={{fontFamily:pf,fontSize:28,fontWeight:700,color:C.coral}}>$9.99</span><span style={{fontFamily:dm,fontSize:11,color:C.mtL}}>USD • one-time</span></div>
        <Btn full onClick={()=>window.open(STRIPE_LINK,"_blank")} style={{animation:"glow 2s ease infinite"}}>Unlock 28-Day Plan — $9.99 USD</Btn>
        <div style={{display:"flex",justifyContent:"center",marginTop:8}}><SocialProof/></div>
        <p style={{fontFamily:dm,fontSize:10,color:C.mtL,textAlign:"center",marginTop:4}}>🔒 Secure payment via Stripe</p>
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

function DashScreen({plan,answers,user,onRegen,onReset,isPaid,genCount,onUpgrade,planHistory,switchPlan,planCreatedAt}){
  const[tab,setTab]=useState("meals");const[day,setDay]=useState(0);const[exp,setExp]=useState(null);const[chk,setChk]=useState({});const[water,setWater]=useState(3);const[mood,setMood]=useState(null);const[btab,setBtab]=useState("home");const[libExp,setLibExp]=useState(null);
  if(!plan?.meal_plan) return <div style={{padding:40,textAlign:"center",fontFamily:dm}}>Loading...</div>;
  const days=plan.meal_plan.map(d=>d.day?.slice(0,3));const meals=plan.meal_plan[day]?.meals||[];const tCal=meals.reduce((s,m)=>s+(m.cal||0),0);const done=meals.filter((_,i)=>chk[`${day}-${i}`]).length;
  const rel=getRelevantEtsy(answers);
  const daysPassed = planCreatedAt ? Math.floor((Date.now()-new Date(planCreatedAt).getTime())/(86400000)) : 0;

  return <div style={{minHeight:"100vh",background:C.bg,paddingBottom:76}}>
    {/* Header */}
    <div style={{background:C.wh,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:`1px solid ${C.peachL}`,position:"sticky",top:0,zIndex:10}}>
      <div onClick={()=>setBtab("home")} style={{cursor:"pointer"}}><Logo s="sm"/></div>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        {isPaid
          ? <span style={{background:`${C.coral}12`,borderRadius:14,padding:"3px 9px",fontFamily:dm,fontSize:9,fontWeight:600,color:C.coral,animation:"fadeScale 0.3s ease"}}>⭐ Premium • 28-Day Plan</span>
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
          <div><div style={{fontFamily:dm,fontSize:9,color:C.mtL,textTransform:"uppercase",letterSpacing:".04em"}}>Diet</div><div style={{fontFamily:dm,fontSize:12,fontWeight:600,color:C.dk,marginTop:2}}>{answers.diet||"—"}</div></div>
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
          <div style={{fontFamily:dm,fontSize:9,color:C.mtL}}>{isPaid?"Unlimited":`${genCount}/${MAX_FREE_GENS} used`}</div>
        </button>
      </div>

      {/* Upgrade CTA for free users */}
      {!isPaid && <div style={{background:`linear-gradient(135deg,${C.coral}06,${C.peach}10)`,borderRadius:14,padding:14,border:`1px solid ${C.coral}18`,marginBottom:12,position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:0,right:0,background:C.coral,color:"#fff",fontFamily:dm,fontSize:8,fontWeight:700,padding:"3px 10px",borderBottomLeftRadius:8,letterSpacing:".04em"}}>MOST POPULAR</div>
        <div style={{marginTop:6}}>
          <div style={{fontFamily:dm,fontSize:13,fontWeight:600,color:C.dk}}>⚡ Unlock Full 28-Day Plan</div>
          <div style={{fontFamily:dm,fontSize:11,color:C.mtL,marginTop:2}}>Unlimited regens • Full month of meals • Complete grocery lists</div>
          <div style={{display:"flex",alignItems:"baseline",gap:6,margin:"8px 0"}}>
            <span style={{fontFamily:pf,fontSize:24,fontWeight:700,color:C.coral}}>$9.99</span>
            <span style={{fontFamily:dm,fontSize:11,color:C.mtL,textDecoration:"line-through"}}>$29.99</span>
            <span style={{fontFamily:dm,fontSize:10,color:C.mtL}}>USD • one-time</span>
          </div>
          <button onClick={onUpgrade} style={{width:"100%",background:`linear-gradient(135deg,${C.coral},${C.coralL})`,color:"#fff",border:"none",borderRadius:10,padding:"10px",fontFamily:dm,fontSize:13,fontWeight:600,cursor:"pointer",animation:"glow 2s ease infinite"}}>Upgrade Now →</button>
        </div>
      </div>}

      {/* Countdown for free users */}
      {!isPaid && <div style={{marginBottom:10}}><CountdownTimer planCreatedAt={planCreatedAt}/></div>}
    </div>}

    {btab==="plan"&&<>
      <div style={{padding:"12px 16px 2px"}}><h2 style={{fontFamily:pf,fontSize:20,fontWeight:600,color:C.dk,animation:"slideUp 0.4s ease"}}>Your Plan</h2><p style={{fontFamily:dm,fontSize:12,color:C.mt,marginTop:1}}>Your {answers.diet} plan for <b>{answers.goal}</b></p></div>

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
          <div style={{display:"flex",gap:4,marginBottom:10,overflowX:"auto"}}>{days.map((d,i)=><button key={i} onClick={()=>{setDay(i);setExp(null)}} style={{flex:"0 0 auto",width:38,height:46,borderRadius:11,border:"none",background:day===i?C.coral:C.wh,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1,boxShadow:day===i?`0 3px 10px ${C.coral}28`:"0 1px 4px rgba(0,0,0,.03)"}}><span style={{fontFamily:dm,fontSize:8,fontWeight:600,color:day===i?"#fff":C.mtL}}>{d}</span><span style={{fontFamily:dm,fontSize:11,fontWeight:700,color:day===i?"#fff":C.dk}}>{i+1}</span></button>)}</div>

          {meals.map((m,i)=>{const k=`${day}-${i}`;const isE=exp===k;const isDone=chk[k]; return <div key={k} style={{background:C.wh,borderRadius:13,marginBottom:7,overflow:"hidden",opacity:(isDone&&!isE)?0.5:1,boxShadow:"0 1px 8px rgba(0,0,0,.03)",transition:"opacity .3s"}}>
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

        {tab==="workout"&&(plan.workout_plan||[]).map((w,i)=><div key={i} style={{background:C.wh,borderRadius:13,padding:13,boxShadow:"0 1px 8px rgba(0,0,0,.03)",marginBottom:7,border:i===day?`2px solid ${C.coral}`:"2px solid transparent"}}>
          <span style={{fontFamily:dm,fontSize:10,color:C.coral,fontWeight:600}}>{w.day}{i===day?" • Today":""}</span>
          <div style={{fontFamily:dm,fontSize:14,fontWeight:600,color:C.dk,marginTop:1}}>{w.icon} {w.name}</div>
          <span style={{fontFamily:dm,fontSize:11,color:C.mtL}}>{w.duration}</span>
          <div style={{display:"flex",flexDirection:"column",gap:3,marginTop:8}}>{(w.exercises||[]).map((ex,j)=><div key={j} style={{display:"flex",alignItems:"center",gap:7,padding:"4px 9px",background:C.bgW,borderRadius:7}}><span style={{fontFamily:dm,fontSize:10,fontWeight:700,color:C.coral,width:14}}>{j+1}</span><span style={{fontFamily:dm,fontSize:11,fontWeight:600,color:C.dk}}>{typeof ex==="string"?ex:ex.name}</span>{typeof ex!=="string"&&ex.detail&&<span style={{fontFamily:dm,fontSize:10,color:C.mtL,marginLeft:"auto"}}>{ex.detail}</span>}</div>)}</div>
        </div>)}

        {tab==="grocery"&&<>{(plan.grocery_list||[]).map((g,i)=><div key={i} style={{marginBottom:12}}><h4 style={{fontFamily:dm,fontSize:13,fontWeight:600,color:C.dk,marginBottom:5}}>{g.category}</h4><div style={{background:C.wh,borderRadius:11,boxShadow:"0 1px 6px rgba(0,0,0,.03)"}}>{(g.items||[]).map((item,j)=><div key={j} style={{display:"flex",alignItems:"center",gap:7,padding:"8px 12px",borderBottom:j<g.items.length-1?`1px solid ${C.bgW}`:"none"}}><div style={{width:16,height:16,borderRadius:4,border:`2px solid ${C.peachL}`,flexShrink:0}}/><span style={{fontFamily:dm,fontSize:12,color:C.dk}}>{item}</span></div>)}</div></div>)}</>}
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
        {[["Goal",answers.goal],["Diet",answers.diet],["Fitness",answers.fitness],["Cook Time",answers.time],["Focus",(answers.focus||[]).join(", ")]].map(([l,v],i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:i<4?`1px solid ${C.bgW}`:"none"}}><span style={{fontFamily:dm,fontSize:12,color:C.mtL}}>{l}</span><span style={{fontFamily:dm,fontSize:12,fontWeight:600,color:C.dk,textAlign:"right",maxWidth:"55%"}}>{v||"—"}</span></div>)}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:7}}>
        <button onClick={onRegen} style={{width:"100%",background:C.wh,border:`2px solid ${C.coral}`,borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}><span style={{fontSize:16}}>🔄</span><div style={{textAlign:"left"}}><div style={{fontFamily:dm,fontSize:13,fontWeight:600,color:C.coral}}>Generate New Plan {!isPaid&&<span style={{fontFamily:dm,fontSize:11,color:C.mtL,fontWeight:400}}>({genCount}/{MAX_FREE_GENS} used)</span>}</div><div style={{fontFamily:dm,fontSize:10,color:C.mtL}}>{isPaid?"Unlimited regenerations":"Retake quiz with new preferences"}</div></div></button>
        {!isPaid&&<button onClick={onUpgrade} style={{width:"100%",background:`linear-gradient(135deg,${C.coral},${C.coralL})`,border:"none",borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}><span style={{fontSize:16}}>⚡</span><div style={{textAlign:"left"}}><div style={{fontFamily:dm,fontSize:13,fontWeight:600,color:"#fff"}}>Upgrade to Premium — $9.99 USD</div><div style={{fontFamily:dm,fontSize:10,color:"#ffffffaa"}}>Unlimited plans + 28-day program</div></div></button>}
        <button onClick={()=>window.open(INSTAGRAM_LINK,"_blank")} style={{width:"100%",background:C.wh,border:`2px solid ${C.peachL}`,borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}><span style={{fontSize:16}}>📸</span><div style={{textAlign:"left"}}><div style={{fontFamily:dm,fontSize:13,fontWeight:600,color:C.dk}}>Follow @fitwithhiral</div><div style={{fontFamily:dm,fontSize:10,color:C.mtL}}>Tips, recipes & wellness on Instagram</div></div></button>
        <button onClick={onReset} style={{width:"100%",background:C.wh,border:`2px solid ${C.peachL}`,borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}><span style={{fontSize:16}}>🏠</span><div style={{textAlign:"left"}}><div style={{fontFamily:dm,fontSize:13,fontWeight:600,color:C.dk}}>Back to Home</div></div></button>
        <button onClick={()=>window.open("https://www.etsy.com/shop/FitWithHiral","_blank")} style={{width:"100%",background:C.wh,border:`2px solid ${C.peachL}`,borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}><span style={{fontSize:16}}>🛍️</span><div style={{textAlign:"left"}}><div style={{fontFamily:dm,fontSize:13,fontWeight:600,color:C.dk}}>Visit Etsy Shop</div></div></button>
      </div>
      <p style={{fontFamily:dm,fontSize:10,color:C.mtL,textAlign:"center",marginTop:20}}>Nourish Her by FitWithHiral v1.0</p>
    </div>}

    {/* Bottom nav */}
    <div style={{position:"fixed",bottom:0,left:0,right:0,background:C.wh,borderTop:`1px solid ${C.peachL}`,display:"flex",justifyContent:"space-around",padding:"7px 0 16px",zIndex:20}}>
      {[["home","🏠","Home"],["plan","🥗","Plan"],["progress","📊","Progress"],["library","📚","Library"],["settings","⚙️","Settings"]].map(([id,icon,lbl])=><button key={id} onClick={()=>setBtab(id)} style={{background:"none",border:"none",display:"flex",flexDirection:"column",alignItems:"center",gap:1,cursor:"pointer",opacity:btab===id?1:.65}}><span style={{fontSize:17}}>{icon}</span><span style={{fontFamily:dm,fontSize:8,color:btab===id?C.coral:C.mt,fontWeight:btab===id?700:500}}>{lbl}</span></button>)}
    </div>
  </div>;
}

// ─── GENERATION LIMIT SCREEN ───
function LimitScreen({genCount, onUpgrade, onHome, expired}){
  return <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:28}}>
    <Fi delay={100}><div style={{width:70,height:70,borderRadius:"50%",background:`${C.coral}12`,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:16}}><span style={{fontSize:36}}>{expired ? "⏰" : "🔒"}</span></div></Fi>
    <Fi delay={200}><h2 style={{fontFamily:pf,fontSize:24,fontWeight:600,color:C.dk,textAlign:"center"}}>{expired ? "Your free plan has expired" : "You've used all "+MAX_FREE_GENS+" free plans"}</h2></Fi>
    <Fi delay={300}><p style={{fontFamily:dm,fontSize:14,color:C.mt,textAlign:"center",maxWidth:320,lineHeight:1.6,marginTop:8}}>{expired ? "Your 7-day free access has ended. Upgrade to keep your plan and unlock the full 28-day program." : "Upgrade to unlock unlimited plan generations and a full 28-day program."}</p></Fi>
    <Fi delay={400}><div style={{background:C.wh,borderRadius:16,padding:18,marginTop:20,width:"100%",maxWidth:340}}>
      {["Unlimited plan regenerations","Full 28-day meal + workout plan","Complete grocery lists","Progress tracking dashboard","Switch between saved plans"].map((f,i) => <div key={i} style={{display:"flex",gap:8,alignItems:"center",padding:"5px 0"}}><span style={{color:C.gr,fontSize:13}}>✓</span><span style={{fontFamily:dm,fontSize:13,color:C.mt}}>{f}</span></div>)}
      <div style={{display:"flex",alignItems:"baseline",gap:6,margin:"14px 0 4px"}}><span style={{fontFamily:dm,fontSize:13,color:C.mtL,textDecoration:"line-through"}}>$29.99 USD</span><span style={{fontFamily:pf,fontSize:30,fontWeight:700,color:C.coral}}>$9.99</span><span style={{fontFamily:dm,fontSize:11,color:C.mtL}}>USD • one-time</span></div>
      <Btn full onClick={onUpgrade} style={{marginTop:10}}>Upgrade Now — $9.99 USD</Btn>
      <p style={{fontFamily:dm,fontSize:10,color:C.mtL,textAlign:"center",marginTop:6}}>🔒 Secure payment via Stripe</p>
    </div></Fi>
    <Fi delay={500}><button onClick={onHome} style={{background:"none",border:"none",fontFamily:dm,fontSize:13,color:C.coral,cursor:"pointer",marginTop:20,padding:"8px 16px"}}>← Go back to Home</button></Fi>
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
      {["✅ Full 28-day meal + workout plan","✅ Unlimited plan regenerations","✅ Complete grocery lists","✅ Progress tracking dashboard","✅ Switch between saved plans"].map((f,i) => <div key={i} style={{padding:"6px 0"}}><span style={{fontFamily:dm,fontSize:14,color:C.dk}}>{f}</span></div>)}
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
            // Load their plan
            const ep = await sbFind("plans", "lead_id", lead.id);
            if (ep) {
              setPlan({ meal_plan: ep.meal_plan, workout_plan: ep.workout_plan, grocery_list: ep.grocery_list });
              setPlanCreatedAt(ep.created_at);
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
            const ep = await sbFind("plans", "lead_id", lead.id);
            if (ep) {
              setPlan({ meal_plan: ep.meal_plan, workout_plan: ep.workout_plan, grocery_list: ep.grocery_list });
              setPlanCreatedAt(ep.created_at);
              // Check expiry for free users
              if (!lead.has_paid && ep.created_at) {
                const daysPassed = Math.floor((new Date() - new Date(ep.created_at)) / (86400000));
                if (daysPassed >= FREE_ACCESS_DAYS) { setExpired(true); setScreen("limit"); return; }
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

  // Check 7-day expiry for free users
  useEffect(()=>{
    if(!isPaid && planCreatedAt){
      const daysPassed = Math.floor((Date.now() - new Date(planCreatedAt).getTime()) / (86400000));
      if(daysPassed >= FREE_ACCESS_DAYS) setExpired(true);
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
    const ep = await sbFind("plans", "lead_id", lead.id);
    if (ep) {
      setPlan({ meal_plan: ep.meal_plan, workout_plan: ep.workout_plan, grocery_list: ep.grocery_list });
      setPlanCreatedAt(ep.created_at);
      if (!lead.has_paid && ep.created_at) {
        const daysPassed = Math.floor((new Date() - new Date(ep.created_at)) / (86400000));
        if (daysPassed >= FREE_ACCESS_DAYS) { setExpired(true); setScreen("limit"); return; }
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

    if (user?.leadId) sbUpdate("leads", user.leadId, { goal: answers.goal, diet_type: answers.diet, fitness_level: answers.fitness, cooking_time: answers.time, focus_areas: answers.focus || [], generation_count: newCount });

    const result = makeFallback(answers);
    const now = new Date().toISOString();
    setPlanCreatedAt(now);

    let p = 0;
    const iv = setInterval(() => {
      p += 2; setProgress(Math.min(p, 100));
      if (p >= 100) {
        clearInterval(iv);
        setTimeout(() => {
          setPlan(result);
          setPlanHistory(prev => [...prev, { plan: result, answers: { ...answers }, createdAt: now, label: "Plan " + (prev.length + 1) + ": " + answers.goal + " (" + answers.diet + ")" }]);
          if (user?.leadId) sbInsert("plans", { lead_id: user.leadId, meal_plan: result.meal_plan, workout_plan: result.workout_plan, grocery_list: result.grocery_list });
          setScreen("preview");
        }, 500);
      }
    }, 50);

    aiGenerate(answers).then(function(aiResult) {
      if (aiResult && aiResult.meal_plan && aiResult.meal_plan.length > 0) {
        setPlan(aiResult);
        if (user?.leadId) sbInsert("plans", { lead_id: user.leadId, meal_plan: aiResult.meal_plan, workout_plan: aiResult.workout_plan, grocery_list: aiResult.grocery_list });
      }
    }).catch(function() {});
  };

  const onBack = () => { if (step > 0) setStep(s => s - 1); else setScreen("email"); };

  const onRegen = () => {
    if (!isPaid && genCount >= MAX_FREE_GENS) { setScreen("limit"); return; }
    setStep(0); setPlan(null); setProgress(0); setScreen("quiz");
  };

  const switchPlan = (idx) => {
    const h = planHistory[idx];
    if (h) { setPlan(h.plan); setAnswers(h.answers); }
  };

  const onUpgrade = () => {
    // Save session before leaving so we can restore after Stripe redirect
    if (user) saveSession({ email: user.email, name: user.name, leadId: user.leadId, isPaid: false });
    window.open(STRIPE_LINK, "_blank");
  };

  const reset = () => {
    clearSession();
    setScreen("welcome"); setStep(0); setAnswers({}); setUser(null); setPlan(null); setProgress(0); setGenCount(0); setIsPaid(false); setPlanHistory([]); setExpired(false);
  };

  // If expired, show limit screen
  if (expired && !isPaid && screen === "dashboard") {
    return <div style={{ maxWidth: 480, margin: "0 auto", background: C.bg, minHeight: "100vh" }}>
      <style>{CSS}</style>
      <LimitScreen genCount={genCount} onUpgrade={onUpgrade} onHome={reset} expired={true} />
    </div>;
  }

  return <div style={{ maxWidth: 480, margin: "0 auto", background: C.bg, minHeight: "100vh", position: "relative", overflow: "hidden" }}>
    <style>{CSS}</style>
    {screen === "welcome" && <WelcomeScreen onStart={() => setScreen("email")} />}
    {screen === "email" && <EmailScreen onSubmit={onEmail} onLogin={onLogin} />}
    {screen === "quiz" && <QuizScreen step={step} answers={answers} onAnswer={onAnswer} onBack={onBack} onNext={onNext} />}
    {screen === "loading" && <LoadingScreen progress={progress} />}
    {screen === "preview" && <PreviewScreen plan={plan} answers={answers} user={user} isPaid={isPaid} onUnlock={() => setScreen("dashboard")} />}
    {screen === "payment-success" && <PaymentSuccessScreen user={user} onContinue={() => setScreen("dashboard")} />}
    {screen === "limit" && <LimitScreen genCount={genCount} onUpgrade={onUpgrade} onHome={reset} expired={expired} />}
    {screen === "dashboard" && <DashScreen plan={plan} answers={answers} user={user} onRegen={onRegen} onReset={reset} isPaid={isPaid} genCount={genCount} onUpgrade={onUpgrade} planHistory={planHistory} switchPlan={switchPlan} planCreatedAt={planCreatedAt} />}
    {showA2HS && screen === "dashboard" && <AddToHomePrompt onDismiss={() => setShowA2HS(false)} />}
  </div>;
}
