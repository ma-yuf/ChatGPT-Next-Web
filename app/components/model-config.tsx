import { ServiceProvider } from "@/app/constant";
import { ModalConfigValidator, ModelConfig, ModelSpec, ModelSpecValidator } from "../store";

import Locale from "../locales";
import { InputRange } from "./input-range";
import { ListItem, Select } from "./ui-lib";
import { useAllModels } from "../utils/hooks";
import { groupBy } from "lodash-es";
import styles from "./model-config.module.scss";
import { getModelProvider } from "../utils/model";

export function ModelConfigList(props: {
  modelConfig: ModelConfig;
  modelSpec: ModelSpec;
  updateConfig: (updater: (config: ModelConfig) => void) => void;
  updateSpec: (updater: (config: ModelSpec) => void) => void;
}) {
  const allModels = useAllModels();
  const groupModels = groupBy(
    allModels.filter((v) => v.available),
    "provider.providerName",
  );
  const value = `${props.modelConfig.model}@${props.modelConfig?.providerName}`;
  const compressModelValue = `${props.modelConfig.compressModel}@${props.modelConfig?.compressProviderName}`;

  const isAnthropic = props.modelConfig?.providerName == ServiceProvider.Anthropic;
  const isReasoningModels = props.modelConfig?.providerName == ServiceProvider.ResponsesAPI && 
      props.modelConfig?.model.startsWith("o");

  const currentReasoningEffort = `${props.modelSpec.responsesapi_reasoning_effort}`;
  const currentReasoningSummary = `${props.modelSpec.responsesapi_reasoning_summary}`;

  return (
    <>
      <ListItem title={Locale.Settings.Model}>
        <Select
          aria-label={Locale.Settings.Model}
          value={value}
          align="left"
          onChange={(e) => {
            const [model, providerName] = getModelProvider(
              e.currentTarget.value,
            );
            props.updateConfig((config) => {
              config.model = ModalConfigValidator.model(model);
              config.providerName = providerName as ServiceProvider;
            });
          }}
        >
          {Object.keys(groupModels).map((providerName, index) => (
            <optgroup label={providerName} key={index}>
              {groupModels[providerName].map((v, i) => (
                <option value={`${v.name}@${v.provider?.providerName}`} key={i}>
                  {v.displayName}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </ListItem>

      {!isReasoningModels && <ListItem
        title={Locale.Settings.Temperature.Title}
        subTitle={Locale.Settings.Temperature.SubTitle}
      >
        <InputRange
          aria={Locale.Settings.Temperature.Title}
          value={props.modelConfig.temperature?.toFixed(1)}
          min="0"
          max="1" // lets limit it to 0-1
          step="0.1"
          onChange={(e) => {
            props.updateConfig(
              (config) =>
                (config.temperature = ModalConfigValidator.temperature(
                  e.currentTarget.valueAsNumber,
                )),
            );
          }}
        ></InputRange>
      </ListItem>}

      {!isReasoningModels && <ListItem
        title={Locale.Settings.TopP.Title}
        subTitle={Locale.Settings.TopP.SubTitle}
      >
        <InputRange
          aria={Locale.Settings.TopP.Title}
          value={(props.modelConfig.top_p ?? 1).toFixed(1)}
          min="0"
          max="1"
          step="0.1"
          onChange={(e) => {
            props.updateConfig(
              (config) =>
                (config.top_p = ModalConfigValidator.top_p(
                  e.currentTarget.valueAsNumber,
                )),
            );
          }}
        ></InputRange>
      </ListItem>}
      
      {isAnthropic && 
      <ListItem
        title="最大 TOKEN 数"
        subTitle="单次交互所用的最大 Token 数"
      >
        <input
          aria-label="max_tokens"
          type="number"
          min="1024"
          max="512000"
          value={props.modelSpec.anthropic_max_tokens}
          onChange={(e) => {
            props.updateSpec(
              (config) =>
                (config.anthropic_max_tokens = ModelSpecValidator.anthropic_max_tokens(
                  e.currentTarget.valueAsNumber, 
                )),
            );
          }}
        ></input>
      </ListItem>}

      {isReasoningModels &&
      <ListItem
        title="思维链长度"
        subTitle="">
        <Select
          aria-label="reasoning_effort"
          value={currentReasoningEffort}
          align="left"
          onChange={(e) => {
            props.updateSpec(
              (config) =>
                (config.responsesapi_reasoning_effort = ModelSpecValidator.responsesapi_reasoning_effort(
                  e.currentTarget.value)))
          }}>
          <optgroup label="reasoning_effort">
            <option value="low">浮想</option>
            <option value="mid">斟酌</option>
            <option value="high">沉思</option>
          </optgroup>
        </Select>
      </ListItem>}

      {isReasoningModels &&
      <ListItem
        title="摘要模式"
        subTitle="">
        <Select
          aria-label="reasoning_summary"
          value={currentReasoningSummary}
          align="left"
          onChange={(e) => {
            props.updateSpec(
              (config) =>
                (config.responsesapi_reasoning_summary = ModelSpecValidator.responsesapi_reasoning_summary(
                  e.currentTarget.value)))
          }}>
          <optgroup label="reasoning_summary">
            <option value="auto">自动</option>
            <option value="concise">简要</option>
            <option value="detailed">详细</option>
          </optgroup>
        </Select>
      </ListItem>}

      <ListItem
        title={Locale.Settings.HistoryCount.Title}
        subTitle={Locale.Settings.HistoryCount.SubTitle}
      >
        <InputRange
          aria={Locale.Settings.HistoryCount.Title}
          title={props.modelConfig.historyMessageCount.toString()}
          value={props.modelConfig.historyMessageCount}
          min="0"
          max="64"
          step="1"
          onChange={(e) =>
            props.updateConfig(
              (config) => (config.historyMessageCount = e.target.valueAsNumber),
            )
          }
        ></InputRange>
      </ListItem>

      <ListItem
        title={Locale.Settings.CompressThreshold.Title}
        subTitle={Locale.Settings.CompressThreshold.SubTitle}
      >
        <input
          aria-label={Locale.Settings.CompressThreshold.Title}
          type="number"
          min={500}
          max={4000}
          value={props.modelConfig.compressMessageLengthThreshold}
          onChange={(e) =>
            props.updateConfig(
              (config) =>
                (config.compressMessageLengthThreshold =
                  e.currentTarget.valueAsNumber),
            )
          }
        ></input>
      </ListItem>
      <ListItem title={Locale.Memory.Title} subTitle={Locale.Memory.Send}>
        <input
          aria-label={Locale.Memory.Title}
          type="checkbox"
          checked={props.modelConfig.sendMemory}
          onChange={(e) =>
            props.updateConfig(
              (config) => (config.sendMemory = e.currentTarget.checked),
            )
          }
        ></input>
      </ListItem>
      <ListItem
        title={Locale.Settings.CompressModel.Title}
        subTitle={Locale.Settings.CompressModel.SubTitle}
      >
        <Select
          className={styles["select-compress-model"]}
          aria-label={Locale.Settings.CompressModel.Title}
          value={compressModelValue}
          onChange={(e) => {
            const [model, providerName] = getModelProvider(
              e.currentTarget.value,
            );
            props.updateConfig((config) => {
              config.compressModel = ModalConfigValidator.model(model);
              config.compressProviderName = providerName as ServiceProvider;
            });
          }}
        >
          {allModels
            .filter((v) => v.available)
            .map((v, i) => (
              <option value={`${v.name}@${v.provider?.providerName}`} key={i}>
                {v.displayName}({v.provider?.providerName})
              </option>
            ))}
        </Select>
      </ListItem>
    </>
  );
}
