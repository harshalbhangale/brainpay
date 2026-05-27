# Requirements Document

## Introduction

The Healthy Shopping Game (HSG) is a structured, multi-round scanning experience that extends BrainPay's single-product live camera into a guided shopping lesson. A parent first defines per-kid nutritional thresholds and allowed product categories. The kid then opens a live camera that streams frames continuously to the server; the system detects multiple products simultaneously and renders a tappable bubble over each detected product on the live preview. The kid taps a bubble to make a selection, the system explains the reasoning, awards Brains scaled by a streak multiplier, and surfaces the round to the parent via the existing PAL feed. The camera stays live across rounds — multiple rounds happen inside one camera session.

HSG reuses BrainPay's existing primitives: Amazon Bedrock Nova Lite for vision, ElevenLabs Flash v2.5 for PAL voice, OpenAI for reasoning generation, the family-first schema, the Brains ledger, and the in-app inbox. P0 of HSG explicitly excludes real-money checkout, Stripe Issuing cards, and multiplayer scan battles; those are P1+.

## Glossary

- **HSG (Healthy_Shopping_Game)**: The feature defined by this document. A multi-round scanning game where a kid evaluates a shelf of products against parent-defined thresholds and is rewarded for selecting the best option.
- **Parent**: A BrainPay account with role `primary_parent` or `co_parent` in the family. Has authority to configure thresholds for any kid in the same family.
- **Kid**: A BrainPay account with role `kid` in the family. The player of HSG.
- **PAL**: The voice character defined in `docs/p0-spec.md`. Speaks via ElevenLabs Flash v2.5 in the persona-style chosen by the player.
- **Brains**: BrainPay's points currency (1 Brain == 1 cent in P1+). Tracked in the `ledger` table.
- **Threshold_Profile**: The set of nutritional limits (per-serving sugar grams, protein grams, calories kcal, carbs grams) and an allowed-category list configured by a Parent for one Kid. One profile per Kid.
- **Allowed_Category**: A product category (for example "snack", "drink", "fruit", "candy") that a Parent has marked permitted for a specific Kid.
- **Shelf_Frame**: A single JPEG image captured by the device camera and streamed to the server for HSG perception. In-flight frames are processed in transient memory and discarded; only the frame associated with a completed Round is persisted as a thumbnail.
- **Shelf_Scan**: The server-side perception pipeline that takes a Shelf_Frame as input and emits a list of detected Product_Cards through the WebSocket connection.
- **Product_Card**: A structured detection for one product on the shelf, containing: name, estimated category, estimated nutrition (sugar_g, protein_g, calories_kcal, carbs_g), bbox, confidence, and a Traffic_Light derived from the Threshold_Profile.
- **Traffic_Light**: One of `green`, `yellow`, `red`, computed by comparing a Product_Card's estimated nutrition to the active Threshold_Profile.
- **Round**: A single instance of the game loop: capture Shelf_Frame, present Product_Cards, prompt Kid for a choice, reveal reasoning, award Brains.
- **Game_Session**: A sequence of one or more Rounds initiated by the Kid. Configurable to be one-shot or multi-round.
- **Best_Of_Bad_Round**: A Round where zero detected Product_Cards meet the Threshold_Profile. The lesson framing changes from "pick the best" to "everything here is junk; if you had to pick, which is the least bad and why".
- **Streak**: A consecutive count of Rounds in which the Kid selected the highest-scoring Product_Card. Stored on the kid's account record.
- **Streak_Multiplier**: A numeric multiplier applied to the base Brains reward, derived from the current Streak length.
- **Hint**: An in-game request from the Kid to PAL for advice on which Product_Card to pick.
- **PAL_Feed**: The parent-visible reverse-chronological event stream described in `docs/p0-spec.md` § 5.4.
- **Inbox**: The in-app notification center described in `docs/p0-spec.md` § 7.4.
- **Detection_Confidence**: A 0..1 score returned by the vision model indicating how certain it is about a single Product_Card's identity.

## Requirements

### Requirement 1: Parent threshold configuration

**User Story:** As a Parent, I want to set per-kid nutritional thresholds and allowed product categories, so that the Healthy Shopping Game scores products against rules I trust for my own child.

#### Acceptance Criteria

1. WHEN a Parent opens the HSG settings screen for a specific Kid, THE HSG SHALL display four sliders for sugar_g, protein_g, calories_kcal, and carbs_g, each pre-populated with the Kid's current Threshold_Profile values.
2. WHEN a Parent first opens the HSG settings for a Kid who has no saved Threshold_Profile, THE HSG SHALL pre-populate the sliders from a default profile derived from the Kid's age band stored on the account.
3. THE HSG SHALL constrain each slider to the following input ranges: sugar_g 0 to 50, protein_g 0 to 50, calories_kcal 0 to 800, carbs_g 0 to 100.
4. WHEN a Parent moves a slider and confirms, THE HSG SHALL persist the updated Threshold_Profile to the database within 500 milliseconds and SHALL associate the profile with the target Kid's `account_id` and the family's `family_id`.
5. THE HSG SHALL allow a Parent to mark each of the categories `drink`, `snack`, `candy`, `fruit`, `vegetable`, `dairy`, `bakery`, `protein_bar`, `cereal`, and `other` as allowed or not allowed for a specific Kid.
6. WHERE the Parent has enabled voice configuration, WHEN the Parent issues a spoken command of the form "set [field] to [value]" while on the HSG settings screen, THE HSG SHALL update the corresponding slider value and persist the Threshold_Profile.
7. IF a Parent attempts to set a slider value outside the constraint range defined in criterion 3, THEN THE HSG SHALL clamp the value to the nearest boundary and SHALL display an inline validation message identifying the field and the allowed range.
8. THE HSG SHALL require an active Threshold_Profile for the target Kid before any Game_Session can begin for that Kid.
9. IF a Kid attempts to start a Game_Session without an active Threshold_Profile, THEN THE HSG SHALL display a "your parent has not set up the game yet" message and SHALL send an Inbox event of kind `hsg_threshold_missing` to every Parent in the family.

### Requirement 2: Game session start and round configuration

**User Story:** As a Kid, I want to start a shopping game and play a known number of rounds, so that I understand the scope of the session before I begin.

#### Acceptance Criteria

1. WHEN a Kid taps the HSG entry on the kid home screen, THE HSG SHALL display a session-start screen showing the Kid's current Streak length, the configured number of Rounds, and a "Start" control.
2. THE HSG SHALL allow the Parent to configure the number of Rounds per Game_Session as an integer between 1 and 5 inclusive, defaulting to 3.
3. WHEN a Kid taps "Start", THE HSG SHALL create a new Game_Session record associated with the Kid's `account_id` and the family's `family_id` and SHALL transition the screen to the camera capture state for Round 1.
4. WHILE a Game_Session is active, THE HSG SHALL display the current Round index and the total Round count on screen.
5. WHEN every Round in a Game_Session has been completed, THE HSG SHALL transition to a session-summary screen and SHALL mark the Game_Session as `completed`.
6. IF the Kid backgrounds the app for longer than 10 minutes during an active Game_Session, THEN THE HSG SHALL mark the Game_Session as `abandoned` on resume and SHALL prompt the Kid to start a new session.

### Requirement 3: Live shelf detection and product cards

**User Story:** As a Kid, I want the camera to recognise products as I move it across a shelf, so that I can compare them in real time without freezing the picture.

#### Acceptance Criteria

1. WHILE the camera is open during an active Round, THE HSG SHALL display a live camera preview and SHALL continuously stream JPEG frames to the server at approximately 700-millisecond intervals matching the existing camera flow.
2. WHILE frames are streaming, THE HSG SHALL run server-side perception on each frame and SHALL emit per-product `productCard.appeared`, `productCard.updated`, and `productCard.cleared` events over the same WebSocket connection that delivered the frames.
3. THE Shelf_Scan perception step SHALL return between 0 and 12 Product_Cards per frame.
4. THE Shelf_Scan perception step SHALL return each Product_Card with the fields name, category, sugar_g, protein_g, calories_kcal, carbs_g, bbox, and Detection_Confidence.
5. WHEN a Product_Card meets the appearance hysteresis threshold (1 hit), THE HSG SHALL render it as a tappable overlay bubble positioned at its bbox over the live preview AND SHALL color the bubble border by its Traffic_Light.
6. WHEN the Kid pans the camera, THE HSG SHALL update each visible Product_Card's anchor in real time via `productCard.updated` events SO THAT bubbles follow the products on screen.
7. WHEN a Product_Card has been missing from the perception output for the clear hysteresis threshold (5 misses), THE HSG SHALL emit `productCard.cleared` and SHALL fade the corresponding bubble out of the overlay.
8. THE HSG SHALL render the first Product_Card bubble within 2000 milliseconds of the camera becoming ready, on a 4G or better connection.
9. IF the WebSocket connection drops or a vision call fails, THEN THE HSG SHALL display a "scan paused, reconnecting" indicator, SHALL attempt automatic reconnection, and SHALL NOT consume the Round.
10. IF the Kid attempts to make a selection but fewer than 2 Product_Cards have appeared on screen, THEN THE HSG SHALL display "frame the shelf so several products are visible" and SHALL NOT consume the Round.

### Requirement 4: Traffic light scoring

**User Story:** As a Kid, I want each product on the shelf colored green, yellow, or red, so that I can see at a glance which ones fit my parent's rules.

#### Acceptance Criteria

1. THE HSG SHALL compute the Traffic_Light for each Product_Card by comparing the card's estimated nutrition values to the active Threshold_Profile for the playing Kid.
2. WHEN every estimated nutrition field on a Product_Card is at or below its threshold AND the card's category is in the Allowed_Category list, THE HSG SHALL set the Traffic_Light to `green`.
3. WHEN at least one estimated nutrition field on a Product_Card exceeds its threshold by no more than 25 percent OR the card's category is not in the Allowed_Category list, THE HSG SHALL set the Traffic_Light to `yellow`.
4. WHEN at least one estimated nutrition field on a Product_Card exceeds its threshold by more than 25 percent, THE HSG SHALL set the Traffic_Light to `red`.
5. THE HSG SHALL compute a numeric score for each Product_Card defined as the count of nutrition fields at or below threshold, with ties broken by lower sugar_g value.
6. THE HSG SHALL identify exactly one Product_Card per Round as the "best choice" using the score from criterion 5 and SHALL persist the chosen `best_card_id` on the Round record.

### Requirement 5: Choice prompt and reasoning reveal

**User Story:** As a Kid, I want to tap the product I think is the best and then be told why my answer was right or wrong, so that I learn how to read nutrition information.

#### Acceptance Criteria

1. WHEN at least 2 Product_Cards are visible AND the Round is not yet selected, THE HSG SHALL render each Product_Card as a tappable bubble with a colored border indicating its Traffic_Light.
2. THE HSG SHALL prevent the reasoning reveal from being shown until the Kid has tapped exactly one Product_Card bubble.
3. WHEN the Kid taps a Product_Card bubble while a Round is active, THE HSG SHALL record the `selected_card_id` on the Round record together with a server-side timestamp.
4. WHEN the selection is recorded, THE HSG SHALL request a reasoning string from the OpenAI service comparing the selected Product_Card to the Round's `best_card_id` and SHALL return the reasoning to the device within 2000 milliseconds.
5. THE HSG SHALL render the reasoning string on screen and SHALL also play it through PAL using the existing ElevenLabs Flash v2.5 streaming flow (`speech.started` → audio chunks → `speech.ended`) in the Kid's chosen voice persona.
6. WHEN the Kid selects the Round's `best_card_id`, THE HSG SHALL mark the Round outcome as `correct`.
7. WHEN the Kid selects any Product_Card other than the `best_card_id`, THE HSG SHALL mark the Round outcome as `incorrect` and the reasoning string SHALL include the specific nutrition comparison that justifies the correct choice (for example, "the granola has 3g sugar, the chocolate bar has 22g").
8. WHERE the reasoning service is unavailable, WHEN a selection is recorded, THE HSG SHALL fall back to a deterministic templated reasoning string derived from the nutrition delta between the selected card and the `best_card_id` and SHALL still play it through PAL.

### Requirement 6: Pop quiz mini-questions

**User Story:** As a Kid, I want occasional pop-quiz questions like "spot the product with the most sugar", so that the game stays varied and teaches me to read labels.

#### Acceptance Criteria

1. WHERE the Game_Session has more than 1 Round, THE HSG SHALL replace the standard "which is better" prompt with a pop-quiz prompt on at most one Round per session, selected at random.
2. THE HSG SHALL select the pop-quiz prompt from the set: "spot the product with the most sugar", "spot the product with the most protein", "spot the product with the fewest calories".
3. WHEN a pop-quiz Round is presented, THE HSG SHALL compute the correct Product_Card from the detected nutrition values and SHALL persist that card identifier as the Round's `best_card_id`.
4. WHEN the Kid selects a Product_Card on a pop-quiz Round, THE HSG SHALL apply the same correct/incorrect outcome rules defined in Requirement 5 criteria 6 and 7.

### Requirement 7: Best-of-bad fallback

**User Story:** As a Kid playing in front of a shelf where everything fails my parent's thresholds, I want the game to still teach me something instead of stalling, so that I can play wherever I am.

#### Acceptance Criteria

1. WHEN every Product_Card in a Round has Traffic_Light `red`, THE HSG SHALL classify the Round as a Best_Of_Bad_Round.
2. WHEN a Round is a Best_Of_Bad_Round, THE HSG SHALL display the prompt "every option here is junk, which is the least bad and why".
3. THE HSG SHALL select the `best_card_id` for a Best_Of_Bad_Round as the Product_Card with the lowest sugar_g value, with ties broken by the lowest calories_kcal value.
4. WHEN the Kid selects the `best_card_id` on a Best_Of_Bad_Round, THE HSG SHALL mark the Round outcome as `correct` and SHALL award the Brains reward defined in Requirement 8 multiplied by 0.5.
5. THE HSG SHALL NOT advance the Streak on a Best_Of_Bad_Round, regardless of outcome.

### Requirement 8: Brains reward and streak

**User Story:** As a Kid, I want to earn Brains for thinking through my shelf choices, with bigger rewards when I keep getting it right, so that the game feels worth playing every day.

#### Acceptance Criteria

1. WHEN a Round outcome is `correct` AND the Round is not a Best_Of_Bad_Round, THE HSG SHALL award a base reward of 5 Brains to the Kid.
2. WHEN a Round outcome is `incorrect`, THE HSG SHALL award 1 Brain to the Kid as a participation reward.
3. THE HSG SHALL maintain a Streak counter on the Kid's account, incremented by 1 on each consecutive Round with outcome `correct` and reset to 0 on any Round with outcome `incorrect`.
4. THE HSG SHALL compute the Streak_Multiplier as 1.0 for streak 0 to 2, 1.25 for streak 3 to 4, 1.5 for streak 5 to 9, and 2.0 for streak 10 or higher.
5. THE HSG SHALL compute the final Brains reward for a Round as the base reward multiplied by the Streak_Multiplier, rounded down to the nearest integer.
6. WHEN a Round is completed, THE HSG SHALL write a single ledger row with `kind = 'scan_skip_reward'`, `brains_delta` equal to the final reward, `account_id` equal to the Kid, `actor_id` equal to the Kid, and metadata containing the `game_session_id`, `round_id`, `selected_card_id`, `best_card_id`, `outcome`, `streak_before`, `streak_after`, and `multiplier`.
7. THE HSG SHALL display the awarded Brains and the new balance in the Round summary, sourced from the ledger row's `balance_after`.
8. THE HSG SHALL never award negative Brains for an HSG Round, even on `incorrect` outcomes.

### Requirement 9: PAL voice hints during a round

**User Story:** As a Kid, I want to ask PAL for a hint when I'm stuck on a round, so that I have a way out without just guessing.

#### Acceptance Criteria

1. WHEN a Round is in the choice-prompt state and the Kid has not yet selected a Product_Card, THE HSG SHALL display a "ask PAL" control.
2. THE HSG SHALL allow at most 1 Hint per Round.
3. WHEN the Kid taps "ask PAL", THE HSG SHALL request a hint string from the OpenAI service that names the two highest-scoring Product_Cards without revealing the `best_card_id` and SHALL play the hint through PAL using ElevenLabs Flash v2.5.
4. WHEN a Hint is successfully delivered to the device in a Round, THE HSG SHALL halve the base reward defined in Requirement 8 criterion 1 for that Round before applying the Streak_Multiplier.
5. IF the Hint service request fails, THEN THE HSG SHALL display "PAL is quiet right now, try again", SHALL NOT consume the Hint, and SHALL NOT modify the Brains reward.

### Requirement 10: Misidentification correction

**User Story:** As a Kid, when the camera mis-identifies a product, I want to correct or dismiss that card, so that the game doesn't punish me for the AI's mistake.

#### Acceptance Criteria

1. WHEN a Product_Card has a Detection_Confidence below 0.6, THE HSG SHALL render the bubble with a dashed border indicating low confidence.
2. WHEN the Kid long-presses a Product_Card bubble, THE HSG SHALL open a correction modal with options "correct name", "wrong product, remove", and "keep as is". A short tap remains reserved for selection per Requirement 5.3.
3. WHEN the Kid selects "wrong product, remove", THE HSG SHALL drop the Product_Card from the Round, recompute the `best_card_id` from the remaining cards, and update the choice prompt accordingly.
4. WHEN the Kid selects "correct name" and submits a corrected name, THE HSG SHALL store the correction on the Round record's metadata and SHALL re-request nutrition estimates and Traffic_Light for that single corrected card from the Shelf_Scan service.
5. IF removing low-confidence cards leaves fewer than 2 Product_Cards in the Round, THEN THE HSG SHALL prompt the Kid to keep panning the camera until more products appear, and SHALL NOT consume the Round.

### Requirement 11: Parent visibility of game outcomes

**User Story:** As a Parent, I want to see what my kid scanned and chose during the game, so that I know whether the game is working and can talk to them about the results.

#### Acceptance Criteria

1. WHEN a Round is completed, THE HSG SHALL append a PAL_Feed entry for the family containing the Kid's name, the Round outcome, the selected Product_Card name, the `best_card_id` Product_Card name, the awarded Brains, and the new Streak length.
2. THE HSG SHALL deliver the PAL_Feed update to any subscribed Parent device via Supabase Realtime within 1000 milliseconds of the Round completion server-side write.
3. WHEN a Game_Session is completed, THE HSG SHALL send an Inbox event of kind `hsg_session_complete` to every Parent in the family containing the session summary.
4. THE HSG SHALL provide a parent-side detail view per Game_Session showing every Round's Shelf_Frame thumbnail (set only after the Round completes via the post-selection thumbnail upload), every detected Product_Card name and Traffic_Light, the Kid's selection, and the reasoning string.
5. THE HSG SHALL NOT mirror the live in-flight ProductCard bubble stream to any Parent device. Parent visibility is post-hoc per Round only — the only persisted artifact is the single thumbnail captured at the moment of selection.

### Requirement 12: In-app purchase scope

**User Story:** As a Kid, I want the game to record my pick and reward me, but I do not need to actually buy the product through the app in P0.

#### Acceptance Criteria

1. THE HSG SHALL NOT initiate any real-money checkout flow within a Game_Session.
2. THE HSG SHALL NOT add the selected Product_Card to the Kid's `cart_items` table.
3. WHERE the Parent has enabled the optional "log to journal" setting, WHEN a Round is completed, THE HSG SHALL append a non-monetary entry to the Kid's activity feed of kind `hsg_round` with no `brains_delta` beyond the reward already written in Requirement 8.
4. THE HSG SHALL clearly label the choice screen with "this is a game, you are not actually buying" so that the Kid understands the scope.

### Requirement 13: Shelf scan response schema

**User Story:** As a developer, I want the Shelf_Scan response to be a strictly typed schema so that the client can safely render product cards.

#### Acceptance Criteria

1. THE Shelf_Scan endpoint SHALL return a JSON object matching the schema `{ shelf_scan_id: string, items: ProductCard[] }`.
2. THE Shelf_Scan endpoint SHALL define ProductCard as `{ id: string, name: string, category: string, sugar_g: number, protein_g: number, calories_kcal: number, carbs_g: number, bbox: [number, number, number, number], confidence: number }` where every numeric nutrition field is non-negative and bbox values are in the range 0 to 1 inclusive.
3. WHEN the vision model returns a value that fails schema validation, THE Shelf_Scan endpoint SHALL drop the offending ProductCard from the response and SHALL log a `shelf_scan.invalid_card` warning containing the validation error.
4. IF schema validation drops every ProductCard from a response, THEN THE Shelf_Scan endpoint SHALL return `{ shelf_scan_id, items: [] }` and the client SHALL apply the recapture flow defined in Requirement 3 criterion 7.

### Requirement 14: Performance and platform constraints

**User Story:** As a player on either iOS or Android, I want the game to feel snappy and to work on the supported platforms, so that the experience is consistent.

#### Acceptance Criteria

1. THE HSG SHALL run on iOS and Android client builds produced from Expo SDK 54.
2. THE HSG SHALL render the first Product_Card on screen within 2000 milliseconds of capture, measured device-side, on a 4G or better network.
3. THE HSG SHALL play the first audio frame of the PAL reasoning reveal within 800 milliseconds of the reasoning string arriving on the device.
4. THE Shelf_Scan endpoint SHALL handle a single Shelf_Frame request with a server-side processing time of no more than 1500 milliseconds at the 95th percentile.

### Requirement 15: Privacy and consent

**User Story:** As a Parent, I want kid-related data and images handled in a COPPA-safe way, so that I can trust my child's experience in this game.

#### Acceptance Criteria

1. THE HSG SHALL retain Shelf_Frame thumbnails associated with completed Rounds for no longer than 30 days from capture, after which the images SHALL be deleted from object storage. In-flight frames streamed during a live camera session and not associated with a completed selection SHALL NEVER be persisted.
2. THE HSG SHALL associate every stored Shelf_Frame thumbnail with the capturing Kid's `account_id` and the `family_id`, with no other personal identifiers attached to the image record.
3. THE HSG SHALL require an active membership row with role `primary_parent` or `co_parent` in the same family before exposing any Shelf_Frame, Round, or Game_Session record to a parent client.
4. WHEN a Parent revokes a Kid's HSG access from the parent settings, THE HSG SHALL refuse to start any new Game_Session for that Kid and SHALL display "your parent has paused this game".
5. THE HSG SHALL log every Shelf_Scan invocation with `account_id`, `family_id`, `shelf_scan_id`, item count, and processing duration.
6. THE HSG SHALL NOT log raw image bytes from any Shelf_Frame; the metadata logging required in criterion 5 SHALL be emitted independently of, and SHALL NOT be skipped by, this prohibition.

### Requirement 16: Out-of-scope features

**User Story:** As a stakeholder, I want the boundary of P0 made explicit so that future work has a clear baseline.

#### Acceptance Criteria

1. THE HSG SHALL NOT implement real-money payments or Stripe Issuing card flows in P0; these are deferred to P1+.
2. THE HSG SHALL NOT implement multiplayer scan battles between friends in P0; this is deferred to P1+.
3. THE HSG SHALL NOT redeem Brains for real money or specific physical items in P0; the "stablecoin reward" framing is a P1+ concept.
4. THE HSG SHALL NOT support barcode-based product lookup in P0; product identification is vision-only.
