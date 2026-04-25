import { bootstrapFeatureRegistry } from "@trade-signal/research-feature";
import { bootstrapPolicyRegistry } from "@trade-signal/research-policy";
import { bootstrapSelectionRegistry } from "@trade-signal/research-selection";
import { bootstrapTopicRegistry } from "@trade-signal/research-topic";

/**
 * 跨层编排：顺序启动 Feature / Policy / Topic / Selection 注册；领域注册逻辑在各层包内。
 */
export function bootstrapV2PluginRegistry(): void {
  bootstrapFeatureRegistry();
  bootstrapPolicyRegistry();
  bootstrapTopicRegistry();
  bootstrapSelectionRegistry();
}
