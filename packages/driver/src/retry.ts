/*!
 * This source file is part of the EdgeDB open source project.
 *
 * Copyright 2019-present MagicStack Inc. and the EdgeDB authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {BaseRawConnection} from "./baseConn";
import {CodecsRegistry} from "./codecs/registry";
import {Address, NormalizedConnectConfig} from "./conUtils";
import * as errors from "./errors";
import {sleep} from "./utils";

export type ConnectWithTimeout = (
  addr: Address,
  config: NormalizedConnectConfig,
  registry: CodecsRegistry
) => Promise<BaseRawConnection>;

let lastLoggingAt = 0;

export async function retryingConnect(
  connectWithTimeout: ConnectWithTimeout,
  config: NormalizedConnectConfig,
  registry: CodecsRegistry
): Promise<BaseRawConnection> {
  const maxTime =
    config.connectionParams.waitUntilAvailable === 0
      ? 0
      : Date.now() + config.connectionParams.waitUntilAvailable;
  while (true) {
    try {
      return await connectWithTimeout(
        config.connectionParams.address,
        config,
        registry
      );
    } catch (e) {
      if (e instanceof errors.ClientConnectionError) {
        if (e.hasTag(errors.SHOULD_RECONNECT)) {
          const now = Date.now();
          if (now > maxTime) {
            throw e;
          }
          if (
            config.logging &&
            (!lastLoggingAt || now - lastLoggingAt > 5000)
          ) {
            lastLoggingAt = now;
            const logMsg = [
              `A client connection error occurred; reconnecting because ` +
                `of "waitUntilAvailable=${config.connectionParams.waitUntilAvailable}".`,
              e
            ];

            if (config.inProject && !config.fromProject && !config.fromEnv) {
              logMsg.push(
                `\n\n\n` +
                  `Hint: it looks like the program is running from a ` +
                  `directory initialized with "edgedb project init". ` +
                  `Consider calling "edgedb.connect()" without arguments.` +
                  `\n`
              );
            }
            // tslint:disable-next-line: no-console
            console.warn(...logMsg);
          }
        } else {
          throw e;
        }
      } else {
        // tslint:disable-next-line: no-console
        console.error("Unexpected connection error:", e);
        throw e; // this shouldn't happen
      }
    }

    await sleep(Math.trunc(10 + Math.random() * 200));
  }
}
