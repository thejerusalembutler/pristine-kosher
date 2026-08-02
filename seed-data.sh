#!/bin/bash
URL="https://qkgdobpazyoxesyiznus.supabase.co/rest/v1"
KEY="sb_publishable_cjaMPpEPhe-HxUd616SSRg_ShraAso2"
H=(-H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json")

echo "=== Seeding WORKERS ==="
# availability helper: a full-day block on given dates
av() { echo "{\"2027-04-$1\":{\"state\":\"full\",\"start\":\"08:00\",\"end\":\"23:00\"},\"2027-04-$2\":{\"state\":\"full\",\"start\":\"08:00\",\"end\":\"23:00\"},\"2027-04-$3\":{\"state\":\"full\",\"start\":\"08:00\",\"end\":\"23:00\"}}"; }

# name|phone|home_base|rate|car|travel|dates
WORKERS=(
"Moshe Adler|(732) 555-0200|Lakewood, NJ|32|true|high|12 13 14"
"Dovid Klein|(732) 555-0201|Lakewood, NJ|30|true|medium|13 14 15"
"Yaakov Weiss|(516) 555-0210|Five Towns, NY|35|true|medium|13 14 15"
"Eli Stern|(516) 555-0211|Five Towns, NY|30|false|low|14 15 16"
"Shmuel Berger|(718) 555-0220|Brooklyn, NY|33|true|high|12 14 16"
"Chaim Fisher|(973) 555-0230|North Jersey|31|true|medium|13 15 16"
"Aryeh Gold|(305) 555-0240|South Florida|34|true|high|14 15 16"
"Nachman Roth|(407) 555-0250|Orlando, FL|30|true|medium|13 14 15"
)
for w in "${WORKERS[@]}"; do
  IFS='|' read -r name phone home rate car travel dates <<< "$w"
  read d1 d2 d3 <<< "$dates"
  curl -s "${H[@]}" -X POST "$URL/workers" -d "{\"name\":\"$name\",\"phone\":\"$phone\",\"home_base\":\"$home\",\"hourly_rate\":$rate,\"has_car\":$car,\"travel_flexibility\":\"$travel\",\"status\":\"active\",\"availability\":$(av $d1 $d2 $d3)}" >/dev/null
  echo "  + $name ($home)"
done

echo ""
echo "=== Seeding BOOKINGS ==="
# name|phone|address|market|base|size|sinks|island|addons|date|time|flex|est
BOOKINGS=(
"Sarah Cohen|(732) 555-0110|12 Forest Ave, Lakewood|Lakewood, NJ|counters|large|null|small|[\"stovetop\"]|2027-04-13|09:00|exact|360"
"Rivka Green|(732) 555-0111|8 Oak St, Lakewood|Lakewood, NJ|counters|medium|null|null|[]|2027-04-13|11:00|limited|265"
"Leah Braun|(732) 555-0112|22 Pine Ct, Lakewood|Lakewood, NJ|sinks|null|2|null|[\"microwave\"]|2027-04-14|10:00|exact|180"
"Miriam Katz|(516) 555-0193|8 Central Ave, Cedarhurst|Five Towns, NY|counters|standard|null|null|[\"microwave\"]|2027-04-14|13:00|limited|290"
"Chana Weiss|(516) 555-0194|30 Broadway, Woodmere|Five Towns, NY|counters|large|null|large|[\"stovetop\",\"oven\"]|2027-04-15|09:30|exact|410"
"Devorah Stern|(718) 555-0195|1420 Ave J, Brooklyn|Brooklyn, NY|counters|medium|null|null|[]|2027-04-14|15:00|limited|265"
"Yael Fried|(718) 555-0196|55 Kings Hwy, Brooklyn|Brooklyn, NY|sinks|null|3|null|[]|2027-04-16|12:00|exact|185"
"Esther Roth|(973) 555-0197|40 Park St, Teaneck|North Jersey|counters|large|null|small|[]|2027-04-15|10:00|limited|330"
"Shira Blum|(305) 555-0198|900 Ocean Dr, Miami Beach|South Florida|counters|small|null|null|[\"oven\"]|2027-04-15|14:00|exact|240"
"Tova Adler|(407) 555-0199|12 Palm Way, Orlando|Orlando, FL|counters|medium|null|null|[\"warming\"]|2027-04-14|11:00|limited|305"
"Batya Klein|(732) 555-0113|5 Cedar Rd, Lakewood|Lakewood, NJ|counters|large|null|null|[\"stovetop\",\"microwave\"]|2027-04-15|16:00|exact|375"
"Rochel Gold|(516) 555-0212|18 Hill St, Lawrence|Five Towns, NY|sinks|null|1|null|[]|2027-04-16|09:00|limited|100"
)
for b in "${BOOKINGS[@]}"; do
  IFS='|' read -r name phone addr market base size sinks island addons date time flex est <<< "$b"
  curl -s "${H[@]}" -X POST "$URL/bookings" -d "{\"status\":\"new\",\"customer_name\":\"$name\",\"phone\":\"$phone\",\"address\":\"$addr\",\"market\":\"$market\",\"base\":\"$base\",\"size\":$([ "$size" = "null" ] && echo null || echo "\"$size\""),\"sink_count\":$sinks,\"island\":$([ "$island" = "null" ] && echo null || echo "\"$island\""),\"addons\":$addons,\"service_date\":\"$date\",\"time_slot\":\"$time\",\"flexibility\":\"$flex\",\"estimate\":$est}" >/dev/null
  echo "  + $name ($market, $date $time)"
done
echo ""
echo "=== Done ==="
