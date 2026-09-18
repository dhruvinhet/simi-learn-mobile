import type { LessonScene, VisualElement } from "@simi/lesson-schema";
import { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import Svg, { Circle, G, Line, Path, Polygon, Rect, Text as SvgText } from "react-native-svg";
import { colors, radii } from "../theme";

const AnimatedG = Animated.createAnimatedComponent(G);
const W = 1000;
const H = 620;
const sx = (value: number) => value * 10;
const sy = (value: number) => value * 6.2;

function Arrow({ item }: { item: VisualElement }) {
  const x1 = sx(item.x);
  const y1 = sy(item.y);
  const x2 = sx(item.x - (item.width ?? 20));
  const y2 = sy(item.y + (item.height ?? 0));
  const color = item.color ?? colors.cyan;
  const angle = Math.atan2(y1 - y2, x1 - x2);
  const size = 18;
  const points = [
    [x2, y2],
    [x1 - size * Math.cos(angle - Math.PI / 6), y1 - size * Math.sin(angle - Math.PI / 6)],
    [x1 - size * Math.cos(angle + Math.PI / 6), y1 - size * Math.sin(angle + Math.PI / 6)],
  ].map((point) => point.join(",")).join(" ");
  return <G><Line x1={x2} y1={y2} x2={x1} y2={y1} stroke={color} strokeWidth={8} strokeLinecap="round" /><Polygon points={points} fill={color} /></G>;
}

function ElementShape({ item }: { item: VisualElement }) {
  const stroke = item.color ?? colors.cyan;
  const fill = item.fill ?? "transparent";
  if (item.type === "circle") return <Circle cx={sx(item.x)} cy={sy(item.y)} r={sx(item.radius ?? 5)} fill={fill} stroke={stroke} strokeWidth={item.color ? 5 : 0} />;
  if (item.type === "rect" || item.type === "highlight" || item.type === "callout") return <Rect x={sx(item.x)} y={sy(item.y)} width={sx(item.width ?? 20)} height={sy(item.height ?? 12)} rx={18} fill={fill} stroke={stroke} strokeWidth={4} />;
  if (item.type === "line") return <Line x1={sx(item.x)} y1={sy(item.y)} x2={sx(item.x + (item.width ?? 20))} y2={sy(item.y + (item.height ?? 0))} stroke={stroke} strokeWidth={6} strokeLinecap="round" strokeDasharray="16 13" />;
  if (item.type === "arrow") return <Arrow item={item} />;
  if (item.type === "path" && item.points && item.points.length >= 4) {
    const pairs = Array.from({ length: Math.floor(item.points.length / 2) }, (_, index) => [item.points![index * 2]!, item.points![index * 2 + 1]!]);
    const d = pairs.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${sx(x!)} ${sy(y!)}`).join(" ");
    return <Path d={d} fill="none" stroke={stroke} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />;
  }
  if (item.type === "text" || item.type === "icon") return <SvgText x={sx(item.x)} y={sy(item.y)} fill={stroke} fontSize={item.type === "icon" ? 52 : 34} fontWeight="700" textAnchor="start">{item.text ?? item.icon ?? ""}</SvgText>;
  if (item.type === "group" && item.children) return <G>{item.children.map((child) => <ElementShape key={child.id} item={child} />)}</G>;
  if (item.type === "chart" || item.type === "timeline" || item.type === "comparison") return <Rect x={sx(item.x)} y={sy(item.y)} width={sx(item.width ?? 30)} height={sy(item.height ?? 20)} rx={18} fill={fill || colors.panelRaised} stroke={stroke} strokeWidth={4} />;
  return null;
}

function AnimatedElement({ item, delay, reducedMotion }: { item: VisualElement; delay: number; reducedMotion: boolean }) {
  const opacity = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(1);
      return;
    }
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 480, delay, useNativeDriver: true }).start();
  }, [delay, opacity, reducedMotion, item.id]);
  return <AnimatedG opacity={opacity}><ElementShape item={item} /></AnimatedG>;
}

export function SceneCanvas({ scene, reducedMotion }: { scene: LessonScene; reducedMotion: boolean }) {
  const delayById = useMemo(() => new Map(scene.animations.map((animation) => [animation.targetId, animation.startMs])), [scene.animations]);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={scene.caption} style={styles.frame}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
        <Rect width={W} height={H} rx={36} fill={colors.panel} />
        {scene.elements.map((item, index) => <AnimatedElement key={item.id} item={item} delay={delayById.get(item.id) ?? index * 160} reducedMotion={reducedMotion} />)}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: "100%", aspectRatio: 1.5, borderRadius: radii.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
});
