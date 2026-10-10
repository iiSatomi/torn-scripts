# Gym build rules and progression

The active planner is `Torn Gym Planner-3.36.txt`. The build page now presents
the training roles, the two target gyms, the prerequisite chain, and the next
action for the selected path.

## Verified rules

- Standard gyms unlock in order through gym EXP. Torn's published table gives
  an estimated energy total spent in the current gym for the next membership.
- Balboas Gym requires Cha Cha's plus DEF + DEX at least 25% above STR + SPD.
- Frontline Fitness requires Cha Cha's plus STR + SPD at least 25% above DEF + DEX.
- Gym 3000, Mr. Isoyamas, Total Rebound, and Elites require George's plus the
  named stat at least 25% above the second-highest stat.
- Sports Science Lab requires Last Round and no more than 150 lifetime Xanax
  plus Ecstasy combined. This was corrected from the old 50 limit.
- George's is the last standard gym; Torn says standard gym EXP stops there.

Primary source: [Torn Gym / Local Gyms](https://wiki.torn.com/wiki/Local_Gyms).

## Tracker behavior

The Plan → Gyms screen shows the next standard gym and the published estimated
energy requirement. Because Torn does not expose live gym EXP through the API,
the tracker has an optional “Energy already spent in this gym” field. Entering
the running total gives an estimated remaining E and progress bar; it is not a
claim of an exact server-side counter.

The planner keeps the estimate separate from the specialist ratio rules: a
build can have the correct ratio while still being unable to buy its specialist
gym because the standard prerequisite or paid membership is not complete.
